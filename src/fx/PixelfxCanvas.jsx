import React, { useEffect, useMemo, useRef } from "react";
import { loadPixelfx } from "./catalog.js";
import {
  createPixelfxPlayer,
  renderPixelfxStill,
  acquireLiveSlot,
  releaseLiveSlot,
  PIXELFX_TIER_LADDER,
  pixelfxBaseTierIndex,
  createAdaptiveQuality,
  PIXELFX_ADAPTIVE_WINDOW,
} from "./player-core.js";
import {
  pixelfxChain,
  judgeLiveSamples,
  countNonTransparent,
  recordPixelfxMount,
  recordPixelfxOk,
  recordPixelfxHeal,
  recordPixelfxDeath,
  recordPixelfxTierDrop,
  pixelfxSessionTierPenalty,
  PIXELFX_PROBE_STEPS,
  PIXELFX_BLANK_PIXEL_FLOOR,
} from "./health.js";
import { useMotionSettings } from "../motion/MotionProvider.jsx";

let instanceSeq = 0;

/**
 * Ambient crossfade length (PIXELFX-WAVE5): when an ambient (looping)
 * mount's pick changes under it — the waiting card's family flips
 * mid-wait, the forge's world is switched — the outgoing frame blends
 * into the incoming one over this window instead of hard-cutting.
 * One-shot mounts never crossfade: their beats are events, not air.
 */
export const PIXELFX_CROSSFADE_MS = 300;

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
 * Adaptive quality (PIXELFX-WAVE5): past the probe, real step costs
 * keep being timed in windows; the ladder controller in player-core
 * drops a rung (step rate + blit raster) under sustained cost and
 * rises again when it subsides — the grey zone between "paints fine"
 * and the probe's slow verdict, absorbed in place instead of by a
 * chain swap. Drops are counted in the health table (tierDrops), a
 * session that keeps healing slow effects starts later mounts one
 * rung down (pixelfxSessionTierPenalty), and a looping candidate
 * still over budget at the ladder's floor is handed to the slow-heal
 * after all. Ambient mounts whose pick changes mid-flight crossfade
 * from the outgoing frame (PIXELFX_CROSSFADE_MS); a pick carrying
 * `flashGuard` (the grand bursts) gets a player that watches its own
 * output for strobing and softens its light layer.
 *
 * Props: { pick?, fx?, palette?, seed?, alts?, loop = true,
 * pixelSize?, onDone?, className?, style?, scene? }. With loop={false}
 * a one-shot plays once and onDone fires when the SURVIVING candidate
 * finishes. `scene` names the placements scene for the persisted
 * health log (PIXELFX-WAVE6); picks from placements already carry
 * their scene, so the prop only serves direct fx mounts.
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
  scene,
}) {
  const canvasRef = useRef(null);
  // The outgoing frame of an ambient pick change, kept for the
  // crossfade (see the cleanup at the bottom of the mount effect).
  const fadeRef = useRef(null);
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
  const flashGuard = Boolean(pick?.flashGuard);
  const pickKey = pick
    ? `${pick.fx}#${pick.seed ?? ""}#${pick.palette ? pick.palette.join(",") : ""}#${(pick.alts || []).map((alt) => alt.fx).join(",")}#${flashGuard ? "fg" : ""}`
    : "";
  const chain = useMemo(
    () => pixelfxChain(pick ?? { fx, palette, seed, alts }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickKey, fx, seed, paletteKey],
  );
  // The scene this mount serves, for persisted health-log events
  // (PIXELFX-WAVE6): an explicit prop wins; placements picks carry
  // their own scene stamp.
  const sceneName = scene ?? pick?.scene ?? null;
  const chainKey =
    chain
      .map((c) => `${c.fx}#${c.seed ?? ""}#${c.palette ? c.palette.join(",") : ""}`)
      .join("|") + (flashGuard ? "|fg" : "");

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
    let paintedAnimated = false;
    // Adaptive quality (PIXELFX-WAVE5) is per-candidate state: it is
    // created inside tryCandidate, so a rescue alternate starts its
    // own walk at the session-penalised base instead of inheriting
    // the failed candidate's floor rung (which would let two bad
    // windows exhaust it without ever walking the ladder).

    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    // The current candidate failed its probe: swap to the next
    // alternate, or — chain exhausted — clear the layer and record
    // the death. Never throws, never touches the host surface.
    const heal = (reason) => {
      const from = chain[attempt];
      // A heal is a rescue, not a scene change: the failed frame is
      // cleared, never crossfaded into the rescuer — and the cleared
      // canvas must not be snapshot-able by a later cleanup either.
      fadeRef.current = null;
      paintedAnimated = false;
      stopLoop();
      observer?.disconnect();
      observer = null;
      // Never leave the failed candidate's last frame frozen on the
      // surface while the next candidate's chunk is still loading.
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      if (attempt + 1 < chain.length) {
        const to = chain[attempt + 1];
        recordPixelfxHeal(from.fx, to.fx, reason, sceneName);
        console.info(
          `[pixelfx] ${from.fx} failed its health probe (${reason}); falling back to ${to.fx}`,
        );
        attempt += 1;
        void tryCandidate();
      } else {
        recordPixelfxDeath(from.fx, reason, sceneName);
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
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // This candidate's adaptive-quality controller (PIXELFX-
      // WAVE5): starts at the device base rung, lowered one rung by
      // the session penalty once this session has healed enough slow
      // effects (health.js), and walks the ladder as windows of real
      // step load are judged.
      const baseIndex = pixelfxBaseTierIndex(isLiteGpu());
      const adaptive = createAdaptiveQuality({
        baseIndex,
        startIndex: Math.min(
          PIXELFX_TIER_LADDER.length - 1,
          baseIndex + pixelfxSessionTierPenalty(),
        ),
      });
      const stepHzNow = () => adaptive.tier.stepHz;
      // A caller-pinned pixelSize still wins over every tier's cap.
      const rasterLimit = () => pixelSize ?? adaptive.tier.rasterCap ?? undefined;
      // Size the visible canvas's backing store for the CURRENT
      // adaptive tier (a caller-pinned pixelSize wins). Resizing
      // clears the canvas and resets the context state, so smoothing
      // is re-pinned on every fit; the adaptive controller re-fits on
      // a tier change and the same tick's blit redraws, so the clear
      // is never presented.
      const fitRaster = () => {
        const limit = rasterLimit();
        const scale = limit ? Math.min(1, limit / Math.max(w, h)) : 1;
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        ctx.imageSmoothingEnabled = false;
      };
      fitRaster();
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const offCtx = off.getContext("2d");
      if (!offCtx) return;
      const image = offCtx.createImageData(w, h);
      const blit = (withFade) => {
        offCtx.putImageData(image, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Ambient crossfade (PIXELFX-WAVE5): blend the outgoing
        // pick's last frame into this one over PIXELFX_CROSSFADE_MS.
        // The fade clock starts at the first blit that can actually
        // show the blend (a slow chunk fetch does not eat it), and
        // only the animated path blends — a still simply replaces.
        const fade = withFade && loop ? fadeRef.current : null;
        if (!fade) {
          ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
          return;
        }
        if (!fade.startedAt) fade.startedAt = performance.now();
        const progress = Math.min(
          1,
          (performance.now() - fade.startedAt) / PIXELFX_CROSSFADE_MS,
        );
        if (progress >= 1) {
          fadeRef.current = null;
          ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
          return;
        }
        ctx.globalAlpha = 1 - progress;
        ctx.drawImage(fade.canvas, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = progress;
        ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
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
          // A still replaces outright (policy changed, not the
          // scene): any pending crossfade snapshot is dropped.
          fadeRef.current = null;
          blit(false);
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
          flashGuard,
        });
      } catch {
        heal("error");
        return;
      }
      // Health probe over real play: step durations and painted-pixel
      // samples from the first PIXELFX_PROBE_STEPS steps (or until a
      // one-shot finishes, whichever comes first).
      const probe = { steps: 0, durations: [], maxPixels: 0, judged: false, playedSeconds: 0 };
      // Adaptive-quality window (PIXELFX-WAVE5): after the probe's
      // verdict, step costs keep being collected one window of
      // PIXELFX_ADAPTIVE_WINDOW steps at a time, as { ms, seconds }
      // pairs — the controller judges the window's LOAD RATIO (step
      // CPU seconds per played second), never per-step milliseconds.
      let adaptWindow = [];
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
        if (acc >= 1 / stepHzNow()) {
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
          blit(true);
          paintedAnimated = true;
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
          } else {
            // Adaptive quality (PIXELFX-WAVE5): the probe has passed
            // this candidate, but sustained step cost in the grey
            // zone still taxes the surface — walk the ladder instead
            // of swapping the effect. A tier change re-fits the
            // raster and immediately re-blits the frame in hand, so
            // the resize's clear is never presented.
            adaptWindow.push({ ms: stepMs, seconds: stepSeconds });
            if (adaptWindow.length >= PIXELFX_ADAPTIVE_WINDOW) {
              const loadRatio =
                adaptWindow.reduce((sum, s) => sum + s.ms, 0) /
                1000 /
                Math.max(0.001, adaptWindow.reduce((sum, s) => sum + s.seconds, 0));
              const verdict = adaptive.observe(loadRatio);
              adaptWindow = [];
              if (verdict.changed === "drop") {
                recordPixelfxTierDrop(candidate.fx, verdict.index - 1, verdict.index, sceneName);
                console.info(
                  `[pixelfx] ${candidate.fx} stepped over budget; quality tier ${verdict.index - 1} → ${verdict.index}`,
                );
                fitRaster();
                blit(true);
              } else if (verdict.changed === "rise") {
                fitRaster();
                blit(true);
              } else if (verdict.exhausted && loop) {
                // Still over budget at the ladder's floor after the
                // debounce: the candidate itself is the problem.
                // One-shots never take this exit — their beat is
                // nearly over and a late swap would jar more than
                // the floor tier costs.
                heal("slow");
                return;
              }
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
        const data = player.step(1 / stepHzNow(), image.data);
        probe.steps = 1;
        probe.durations.push(performance.now() - stepStarted);
        probe.maxPixels = countNonTransparent(data);
        blit(true);
        paintedAnimated = true;
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
      // Ambient crossfade (PIXELFX-WAVE5): if this run painted
      // animated frames, keep the last one — the next run of this
      // component (a changed pick: the waiting family flipped, the
      // forge world switched, the theme re-shaded the palette)
      // blends from it instead of hard-cutting. One-shot runs leave
      // nothing behind: their canvas is an event, not a surface.
      if (loop && paintedAnimated && canvas.width > 0 && canvas.height > 0) {
        try {
          const snap = fadeRef.current?.canvas ?? document.createElement("canvas");
          snap.width = canvas.width;
          snap.height = canvas.height;
          const snapCtx = snap.getContext("2d");
          if (snapCtx) {
            snapCtx.drawImage(canvas, 0, 0);
            fadeRef.current = { canvas: snap, startedAt: 0 };
          }
        } catch {
          /* a snapshot is a nicety, never a failure */
        }
      }
    };
    // The chain identity is captured via chainKey; pick objects are
    // re-created by callers (placements returns fresh copies).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainKey, loop, pixelSize, animate, sceneName]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ imageRendering: "pixelated", ...style }}
      aria-hidden="true"
    />
  );
}
