import { useEffect, useRef } from "react";
import { useMotionSettings } from "../motion/MotionProvider.jsx";

/**
 * The weaving atmosphere layer (PHONE-FIX §37, item G): slow violet /
 * mint light-threads and rising stardust on a canvas — the "织" of
 * 织界 made visible. Zero dependencies, transform-free (canvas draws
 * only, layout never touched).
 *
 * Hard rules, all enforced here rather than at the call sites:
 *  - The layer obeys the one motion switchboard: when the reader's
 *    motion setting is off, or the system asks for reduced motion, or
 *    save-data is on, the component renders NOTHING — no canvas in
 *    the DOM at all, not a paused one.
 *  - Counts scale with the viewport width and are capped; DPR ≤ 2.
 *  - The loop stops when the layer leaves the viewport
 *    (IntersectionObserver) or the tab hides (visibilitychange).
 *  - Never mounted in the reader or over scrolling lists — that is a
 *    call-site discipline this file's densities assume.
 */
const DENSITIES = {
  hero: { threads: 7, dust: 34, alpha: 1 },
  forge: { threads: 6, dust: 26, alpha: 0.9 },
  waiting: { threads: 5, dust: 22, alpha: 0.8 },
  login: { threads: 7, dust: 30, alpha: 0.95 },
  faint: { threads: 3, dust: 12, alpha: 0.45 },
  dust: { threads: 0, dust: 14, alpha: 0.85 },
};

const THREAD_COLORS = ["139,124,240", "29,158,116", "96,165,250"];
const DUST_COLORS = ["226,232,255", "167,243,208", "196,181,253"];

function makeParticles(width, height, density) {
  const scale = Math.min(1.4, Math.max(0.6, width / 390));
  const threadCount = Math.min(9, Math.round(density.threads * scale));
  const dustCount = Math.min(48, Math.round(density.dust * scale));
  const random = Math.random;
  const threads = Array.from({ length: threadCount }, (_, index) => ({
    x: random() * width,
    y: random() * height,
    length: 34 + random() * 62,
    drift: 1.5 + random() * 3.2,
    sway: 6 + random() * 12,
    phase: random() * Math.PI * 2,
    speed: 0.11 + random() * 0.16,
    color: THREAD_COLORS[index % THREAD_COLORS.length],
    alpha: 0.1 + random() * 0.12,
  }));
  const dust = Array.from({ length: dustCount }, (_, index) => ({
    x: random() * width,
    y: random() * height,
    radius: 0.6 + random() * 1.3,
    rise: 2.2 + random() * 4.5,
    sway: 3 + random() * 8,
    phase: random() * Math.PI * 2,
    speed: 0.14 + random() * 0.22,
    color: DUST_COLORS[index % DUST_COLORS.length],
    alpha: 0.22 + random() * 0.34,
  }));
  return { threads, dust };
}

const STAR_COLORS = ["235,240,255", "196,215,255", "221,214,254"];

/**
 * The login starfield (PHONE-FIX §37, item H, final wording): stars
 * with depth drifting steadily toward the viewer — far ones small
 * and slow, near ones larger and faster, flowing past without end.
 * Deliberately sparse and slow ("简洁高级"): fine points, wide
 * spacing, no threads, no colour noise. Performance follows the G1
 * contract (count capped and width-scaled, DPR ≤ 2, pause off-view /
 * hidden tab). One deliberate exception to the G1 gate: when motion
 * is off this layer still renders — as a STATIC star field, stars
 * present but frozen — because the login ground is the starfield
 * itself, not an ornament on top of it.
 */
function makeStars(width, height) {
  const scale = Math.min(1.3, Math.max(0.6, width / 390));
  const count = Math.min(90, Math.round(64 * scale));
  return Array.from({ length: count }, (_, index) => ({
    // Position in a centred, normalised star space; z is depth
    // (1 = far away, →0 = at the viewer's eye).
    nx: Math.random() * 2 - 1,
    ny: Math.random() * 2 - 1,
    z: 0.12 + Math.random() * 0.88,
    color: STAR_COLORS[index % STAR_COLORS.length],
    alpha: 0.35 + Math.random() * 0.45,
  }));
}

function projectStar(star, width, height) {
  const spread = 1 / Math.max(0.06, star.z);
  return {
    x: width / 2 + (star.nx * width * 0.5 * spread) / 2.4,
    y: height / 2 + (star.ny * height * 0.5 * spread) / 2.4,
    radius: Math.min(2.1, 0.35 + (1 - star.z) * 1.9),
    alpha: star.alpha * Math.min(1, 1.35 - star.z * 0.55),
  };
}

export default function ParticleField({ density = "hero", className = "" }) {
  const motion = useMotionSettings();
  const canvasRef = useRef(null);
  const active = Boolean(motion?.enabled) && !motion?.reducedMotion && !motion?.saveData;
  const isStarfield = density === "starfield";
  const spec = DENSITIES[density] || DENSITIES.hero;

  useEffect(() => {
    if (isStarfield) {
      const canvas = canvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent) return undefined;
      const context = canvas.getContext("2d");
      if (!context) return undefined;
      let width = 0;
      let height = 0;
      let stars = [];
      let raf = 0;
      let running = false;
      let inView = true;
      let last = 0;
      const resize = () => {
        const rect = parent.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        width = Math.max(1, Math.round(rect.width));
        height = Math.max(1, Math.round(rect.height));
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        stars = makeStars(width, height);
        canvas.dataset.starCount = String(stars.length);
        if (!active) drawFrame(0, true);
      };
      const drawFrame = (dt, still = false) => {
        context.clearRect(0, 0, width, height);
        for (const star of stars) {
          if (!still) {
            // Slow approach: depth closes at a near-constant gentle
            // rate; near stars (small z) sweep past faster because
            // their projection grows as 1/z.
            star.z -= dt * 0.028;
            if (star.z <= 0.06) {
              star.z = 1;
              star.nx = Math.random() * 2 - 1;
              star.ny = Math.random() * 2 - 1;
            }
          }
          const point = projectStar(star, width, height);
          if (point.x < -4 || point.x > width + 4 || point.y < -4 || point.y > height + 4) continue;
          context.fillStyle = `rgba(${star.color},${point.alpha.toFixed(3)})`;
          context.beginPath();
          context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
          context.fill();
        }
      };
      const draw = (now) => {
        if (!running) return;
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
        last = now;
        drawFrame(dt);
        raf = requestAnimationFrame(draw);
      };
      const sync = () => {
        const shouldRun = active && inView && !document.hidden;
        if (shouldRun && !running) {
          running = true;
          last = 0;
          raf = requestAnimationFrame(draw);
        } else if (!shouldRun && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      };
      resize();
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(parent);
      const intersection = new IntersectionObserver(
        (entries) => {
          inView = entries[0]?.isIntersecting !== false;
          sync();
        },
        { threshold: 0.02 },
      );
      intersection.observe(canvas);
      const onVisibility = () => sync();
      document.addEventListener("visibilitychange", onVisibility);
      sync();
      return () => {
        running = false;
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        intersection.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
    if (!active) return undefined;
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    let width = 0;
    let height = 0;
    let particles = { threads: [], dust: [] };
    let raf = 0;
    let running = false;
    let inView = true;
    let last = 0;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = makeParticles(width, height, spec);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);

    const draw = (now) => {
      if (!running) return;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      const t = now / 1000;
      context.clearRect(0, 0, width, height);
      for (const thread of particles.threads) {
        thread.y -= thread.drift * dt;
        if (thread.y + thread.length < -8) {
          thread.y = height + 8;
          thread.x = Math.random() * width;
        }
        const swayX = Math.sin(t * thread.speed * 2 + thread.phase) * thread.sway;
        const x = thread.x + swayX;
        const gradient = context.createLinearGradient(x, thread.y, x, thread.y + thread.length);
        gradient.addColorStop(0, `rgba(${thread.color},0)`);
        gradient.addColorStop(0.5, `rgba(${thread.color},${(thread.alpha * spec.alpha).toFixed(3)})`);
        gradient.addColorStop(1, `rgba(${thread.color},0)`);
        context.strokeStyle = gradient;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, thread.y);
        context.quadraticCurveTo(
          x + Math.sin(t * thread.speed + thread.phase) * 7,
          thread.y + thread.length / 2,
          x + swayX * 0.4,
          thread.y + thread.length,
        );
        context.stroke();
      }
      for (const mote of particles.dust) {
        mote.y -= mote.rise * dt;
        if (mote.y < -4) {
          mote.y = height + 4;
          mote.x = Math.random() * width;
        }
        const x = mote.x + Math.sin(t * mote.speed * 2 + mote.phase) * mote.sway;
        const twinkle = 0.72 + 0.28 * Math.sin(t * (0.6 + mote.speed) + mote.phase * 2);
        context.fillStyle = `rgba(${mote.color},${(mote.alpha * spec.alpha * twinkle).toFixed(3)})`;
        context.beginPath();
        context.arc(x, mote.y, mote.radius, 0, Math.PI * 2);
        context.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    const sync = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && !running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(draw);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };
    const intersection = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting !== false;
        sync();
      },
      { threshold: 0.02 },
    );
    intersection.observe(canvas);
    const onVisibility = () => sync();
    document.addEventListener("visibilitychange", onVisibility);
    sync();
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, spec, isStarfield]);

  if (!active && !isStarfield) return null;
  return <canvas ref={canvasRef} className={`particle-field ${className}`.trim()} data-density={density} aria-hidden="true" />;
}

/** The burst's own gate: same switchboard, read without a hook. */
function burstAllowed() {
  try {
    if (window.localStorage.getItem("storyweave:motion") === "off") return false;
  } catch {
    /* Preference unreadable — the media queries below still apply. */
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (navigator.connection?.saveData) return false;
  return true;
}

/**
 * One ≤1s celebratory burst (G3): publish / follow / chapter-landed
 * moments. A throwaway fixed canvas, ~26 sparks in the brand colours,
 * gone in 950ms, pointer-transparent, and silent when motion is off.
 */
export function burstParticles({ x, y } = {}) {
  if (typeof window === "undefined" || !burstAllowed()) return;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:240";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = typeof x === "number" ? x : window.innerWidth / 2;
  const cy = typeof y === "number" ? y : window.innerHeight / 3;
  const sparks = Array.from({ length: 26 }, (_, index) => {
    const angle = (index / 26) * Math.PI * 2 + Math.random() * 0.35;
    const speed = 34 + Math.random() * 88;
    return {
      angle,
      speed,
      radius: 1 + Math.random() * 1.9,
      color: [...THREAD_COLORS, ...DUST_COLORS][index % 6],
      alpha: 0.5 + Math.random() * 0.4,
    };
  });
  const started = performance.now();
  const frame = (now) => {
    const progress = (now - started) / 950;
    if (progress >= 1) {
      canvas.remove();
      return;
    }
    const t = progress * 0.95;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const spark of sparks) {
      const distance = spark.speed * t * (1 - 0.35 * t);
      const px = cx + Math.cos(spark.angle) * distance;
      const py = cy + Math.sin(spark.angle) * distance - 14 * t;
      context.fillStyle = `rgba(${spark.color},${(spark.alpha * (1 - progress)).toFixed(3)})`;
      context.beginPath();
      context.arc(px, py, spark.radius * (1 - progress * 0.5), 0, Math.PI * 2);
      context.fill();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Burst from an element's centre — the call sites' convenience form. */
export function burstFromElement(element) {
  if (!element?.getBoundingClientRect) return;
  const rect = element.getBoundingClientRect();
  burstParticles({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
}
