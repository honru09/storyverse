import React, { useEffect, useMemo, useRef } from "react";
import { loadPixelfx } from "./catalog.js";
import {
  createPixelfxPlayer,
  renderPixelfxStill,
  acquireLiveSlot,
  releaseLiveSlot,
  pixelfxQualityTier,
} from "./player-core.js";
import {
  pixelfxChain,
  judgeLiveSamples,
  countNonTransparent,
  recordPixelfxMount,
  recordPixelfxOk,
  recordPixelfxHeal,
  recordPixelfxDeath,
  PIXELFX_PROBE_STEPS,
  PIXELFX_BLANK_PIXEL_FLOOR,
} from "./health.js";
import { useMotionSettings } from "../motion/MotionProvider.jsx";

let instanceSeq = 0;

// MotionProvider's lite verdict, read the same way it publishes it:
// the <html> class it mirrors, with the raw navigator predicate as
// the fallback for surfaces mounted before the provider's effect.
function isLiteGpu() {
  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("is-lite-gpu")
  ) {
    return true;
  }
  if (typeof navigator === "undefined") return false;
  return (
    (Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory <= 4) ||
    (Number.isFinite(navigator.hardwareConcurrency) &&
      navigator.hardwareConcurrency <= 4)
  );
}

/**
 * One vendored pixelfx effect on a canvas (DESIGN.md §60).
 *
 * Rendering: the effect draws into an offscreen pixel frame at its
 * native size (player-core), is composited there, and the visible
 * canvas scales that frame up with image-rendering: pixelated — the
 * visible canvas's backing store is capped by `pixelSize` (long edge,
 * px) when a caller wants a smaller raster, or by the lite quality
 * tier (player-core) on weak devices.
 *
 * Motion discipline: the global motion policy governs this component
 * like every other. When motion is off (user toggle, prefers-reduced-
 * motion, save-data, or no provider), it paints exactly one still and
 * never starts rAF. An IntersectionObserver pauses the loop offscreen,
 * the tab-visibility signal pauses it hidden, and a module-level slot
 * cap (player-core) degrades extra instances to stills.
 *
 * Self-healing (PIXELFX-WAVE3): the caller hands over a placements
 * `pick` (or legacy fx/palette/seed props plus optional `alts`), and
 * the component walks that candidate chain under a health probe —
 * the first frames are sampled for painted pixels and step cost, a
 * still is pixel-checked before it is shown, and any candidate that
 * throws, paints nothing, or steps over budget is swapped for the
 * next alternate (at most PIXELFX_MAX_HEALS swaps). Exhausting the
 * chain clears the canvas and records the death in the health table
 * (window.__pixelfxHealth); an effect failure can never break the
 * host surface.
 *
 * Props: { pick?, fx?, palette?, seed?, alts?, loop = true,
 * pixelSize?, onDone?, className?, style? }. With loop={false} a
 * one-shot plays once and onDone fires when the SURVIVING candidate
 * finishes.
 */
export default function PixelfxCanvas({
  pick,
  fx,
  palette,
  seed,
  alts,
  loop = true,
  pixelSize,
  onDone,
  className,
  style,
}) {
  const canvasRef = useRef(null);
  const settings = useMotionSettings();
  const animate =
    Boolean(settings) &&
    settings.enabled &&
    !settings.reducedMotion &&
    !settings.saveData &&
    settings.visible !== false;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const paletteKey = palette ? palette.join(",") : "";
  const pickKey = pick
    ? `${pick.fx}#${pick.seed ?? ""}#${pick.palette ? pick.palette.join(",") : ""}#${(pick.alts || []).map((alt) => alt.fx).join(",")}`
    : "";
  const chain = useMemo(
    () => pixelfxChain(pick ?? { fx, palette, seed, alts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickKey, fx, seed, paletteKey],
  );
  const chainKey = chain
    .map((c) => `${c.fx}#${c.seed ?? ""}#${c.palette ? c.palette.join(",") : ""}`)
    .join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chain.length) return undefined;
    let disposed = false;
    let raf = 0;
    let observer = null;
    let intersecting = true;
    const token = { seq: ++instanceSeq };
    let slotHeld = false;
    let attempt = 0;
    const { stepHz, rasterCap } = pixelfxQualityTier(isLiteGpu());
    const rasterLimit = pixelSize ?? rasterCap ?? undefined;

    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // The current candidate failed its probe: swap to the next
    // alternate, or — chain exhausted — clear the layer and record
    // the death. Never throws, never touches the host surface.
    const heal = (reason) => {
      const from = chain[attempt];
      stopLoop();
      observer?.disconnect();
      observer = null;
      // Never leave the failed candidate's last frame frozen on the
      // surface while the next candidate's chunk is still loading.
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      if (attempt + 1 < chain.length) {
        const to = chain[attempt + 1];
        recordPixelfxHeal(from.fx, to.fx, reason);
        console.info(
          `[pixelfx] ${from.fx} failed its health probe (${reason}); falling back to ${to.fx}`,
        );
        attempt += 1;
        void tryCandidate();
      } else {
        recordPixelfxDeath(from.fx, reason);
        console.warn(
          `[pixelfx] ${from.fx} removed: health probe failed (${reason}) and no alternates remain`,
        );
        // The mount is inert now: hand the live slot back at once,
        // and for a one-shot resolve the beat through onDone so the
        // host wrapper unmounts instead of leaking a dead canvas.
        if (slotHeld) {
          releaseLiveSlot(token);
          slotHeld = false;
        }
        if (!loop) onDoneRef.current?.();
      }
    };

    const tryCandidate = async () => {
      const myAttempt = attempt;
      const candidate = chain[myAttempt];
      if (!candidate) return;
      recordPixelfxMount(candidate.fx);
      let mod = null;
      try {
        mod = await loadPixelfx(candidate.fx);
      } catch {
        mod = null;
      }
      if (disposed || myAttempt !== attempt) return;
      if (!mod) {
        heal("error");
        return;
      }
      const meta = mod.meta ?? {};
      const [w, h] = meta.size ?? [96, 96];
      const scale = rasterLimit ? Math.min(1, rasterLimit / Math.max(w, h)) : 1;
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const offCtx = off.getContext("2d");
      if (!offCtx) return;
      const image = offCtx.createImageData(w, h);
      const blit = () => {
        offCtx.putImageData(image, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
      };

      if (!slotHeld && animate) slotHeld = acquireLiveSlot(token);
      const wantsAnimation = animate && slotHeld;
      if (!wantsAnimation) {
        // Still path (motion off / over the live cap): the still is
        // pixel-probed before it is allowed on screen.
        try {
          const still = renderPixelfxStill(mod, {
            seed: candidate.seed,
            palette: candidate.palette,
          });
          if (disposed || myAttempt !== attempt) return;
          if (countNonTransparent(still.data) <= PIXELFX_BLANK_PIXEL_FLOOR) {
            heal("blank");
            return;
          }
          image.data.set(still.data);
          blit();
          recordPixelfxOk(candidate.fx);
          // A one-shot that lands as a still has still been shown:
          // resolve the beat so the host wrapper removes the canvas
          // instead of leaving a frozen frame on the surface.
          if (!loop) onDoneRef.current?.();
        } catch {
          if (!disposed && myAttempt === attempt) heal("error");
        }
        return;
      }
      let player;
      try {
        player = createPixelfxPlayer(mod, {
          seed: candidate.seed,
          palette: candidate.palette,
          repeat: loop && !meta.loop,
        });
      } catch {
        heal("error");
        return;
      }
      // Health probe over real play: step durations and painted-pixel
      // samples from the first PIXELFX_PROBE_STEPS steps (or until a
      // one-shot finishes, whichever comes first).
      const probe = { steps: 0, durations: [], maxPixels: 0, judged: false, playedSeconds: 0 };
      // Step at the effects' authored rate (quality tier steps/s),
      // not at rAF rate: on a 60Hz screen the naive loop would double
      // both the playback speed and the per-second CPU. Steps
      // accumulate real elapsed time, so a slow frame catches up in
      // one bigger step.
      let last = performance.now();
      let acc = 0;
      const tick = (now) => {
        if (disposed || myAttempt !== attempt) return;
        raf = 0;
        if (!intersecting) return;
        acc += Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        if (acc >= 1 / stepHz) {
          const stepSeconds = acc;
          acc = 0;
          const stepStarted = performance.now();
          let data;
          try {
            data = player.step(stepSeconds, image.data);
          } catch {
            heal("error");
            return;
          }
          const stepMs = performance.now() - stepStarted;
          blit();
          if (!loop) probe.playedSeconds += stepSeconds;
          const naturalDone = player.done;
          // A looping-meta candidate inside a one-shot mount can
          // never report done (placements forbids the pairing since
          // wave 3, but the player does not trust data alone): its
          // authored duration is its finish line.
          const forcedDone =
            !loop && meta.loop && probe.playedSeconds >= (meta.duration ?? 1.6);
          if (!probe.judged) {
            probe.steps += 1;
            probe.durations.push(stepMs);
            if (probe.steps % 5 === 0 || naturalDone || forcedDone) {
              probe.maxPixels = Math.max(probe.maxPixels, countNonTransparent(data));
            }
            if (naturalDone || forcedDone || probe.steps >= PIXELFX_PROBE_STEPS) {
              probe.judged = true;
              const verdict = judgeLiveSamples(probe);
              if (!verdict.ok) {
                heal(verdict.reason);
                return;
              }
              recordPixelfxOk(candidate.fx);
            }
          }
          if (!loop && (naturalDone || forcedDone)) {
            onDoneRef.current?.();
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      const startLoop = () => {
        if (disposed || myAttempt !== attempt || raf || !intersecting) return;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      };
      // Paint one frame immediately so the surface is never blank
      // while the first rAF is pending; that step is probe step one.
      try {
        const stepStarted = performance.now();
        const data = player.step(1 / stepHz, image.data);
        probe.steps = 1;
        probe.durations.push(performance.now() - stepStarted);
        probe.maxPixels = countNonTransparent(data);
        blit();
      } catch {
        heal("error");
        return;
      }
      if ("IntersectionObserver" in window) {
        observer = new IntersectionObserver(
          (entries) => {
            intersecting = entries[0]?.isIntersecting !== false;
            if (intersecting) startLoop();
            else stopLoop();
          },
          { threshold: 0.02 },
        );
        observer.observe(canvas);
      }
      startLoop();
    };

    void tryCandidate();

    return () => {
      disposed = true;
      stopLoop();
      observer?.disconnect();
      if (slotHeld) releaseLiveSlot(token);
    };
    // The chain identity is captured via chainKey; pick objects are
    // re-created by callers (placements returns fresh copies).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainKey, loop, pixelSize, animate]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ imageRendering: "pixelated", ...style }}
      aria-hidden="true"
    />
  );
}
