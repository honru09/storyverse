import React, { useEffect, useRef } from "react";
import { loadPixelfx } from "./catalog.js";
import {
  createPixelfxPlayer,
  renderPixelfxStill,
  acquireLiveSlot,
  releaseLiveSlot,
} from "./player-core.js";
import { useMotionSettings } from "../motion/MotionProvider.jsx";

let instanceSeq = 0;

/**
 * One vendored pixelfx effect on a canvas (DESIGN.md §60).
 *
 * Rendering: the effect draws into an offscreen pixel frame at its
 * native size (player-core), is composited there, and the visible
 * canvas scales that frame up with image-rendering: pixelated — the
 * visible canvas's backing store is capped by `pixelSize` (long edge,
 * px) when a caller wants a smaller raster.
 *
 * Motion discipline: the global motion policy governs this component
 * like every other. When motion is off (user toggle, prefers-reduced-
 * motion, save-data, or no provider), it paints exactly one still and
 * never starts rAF. An IntersectionObserver pauses the loop offscreen,
 * the tab-visibility signal pauses it hidden, and a module-level slot
 * cap (player-core) degrades extra instances to stills.
 *
 * Props: { fx (catalog id), palette?, seed?, loop = true, pixelSize?,
 * onDone?, className?, style? }. With loop={false} a one-shot plays
 * once and onDone fires when it finishes.
 */
export default function PixelfxCanvas({
  fx,
  palette,
  seed,
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fx) return undefined;
    let disposed = false;
    let raf = 0;
    let observer = null;
    let intersecting = true;
    const token = { seq: ++instanceSeq };
    let slotHeld = false;

    const stopLoop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    loadPixelfx(fx).then((mod) => {
      if (disposed || !mod) return;
      const meta = mod.meta ?? {};
      const [w, h] = meta.size ?? [96, 96];
      const scale = pixelSize ? Math.min(1, pixelSize / Math.max(w, h)) : 1;
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

      const wantsAnimation = animate && acquireLiveSlot(token);
      if (!wantsAnimation) {
        const still = renderPixelfxStill(mod, { seed, palette });
        image.data.set(still.data);
        blit();
        return;
      }
      slotHeld = true;
      const player = createPixelfxPlayer(mod, {
        seed,
        palette,
        repeat: loop && !meta.loop,
      });
      // Step at the effects' authored rate (30 steps/s), not at rAF
      // rate: on a 60Hz screen the naive loop would double both the
      // playback speed and the per-second CPU. Steps accumulate real
      // elapsed time, so a slow frame catches up in one bigger step.
      let last = performance.now();
      let acc = 0;
      const tick = (now) => {
        if (disposed) return;
        raf = 0;
        if (!intersecting) return;
        acc += Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        if (acc >= 1 / 30) {
          player.step(acc, image.data);
          acc = 0;
          blit();
          if (!loop && player.done) {
            onDoneRef.current?.();
            return;
          }
        }
        raf = requestAnimationFrame(tick);
      };
      const startLoop = () => {
        if (disposed || raf || !intersecting) return;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      };
      // Paint one frame immediately so the surface is never blank while
      // the first rAF is pending.
      player.step(1 / 30, image.data);
      blit();
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
    });

    return () => {
      disposed = true;
      stopLoop();
      observer?.disconnect();
      if (slotHeld) releaseLiveSlot(token);
    };
    // palette identity is captured via paletteKey; the array itself is
    // re-created by callers (placements returns fresh copies).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx, seed, loop, pixelSize, animate, paletteKey]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ imageRendering: "pixelated", ...style }}
      aria-hidden="true"
    />
  );
}
