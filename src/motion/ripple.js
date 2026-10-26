/*
 * Click burst ripple (DESIGN.md §5, --dur-ripple). One delegated pointer
 * listener: interactive surfaces get a light-burst span at the press point.
 * Skipped for keyboard input, reduced motion, and when the app shell has
 * motion switched off; the span removes itself after the animation.
 */

const TARGETS = [
  ".button",
  ".template-brick",
  ".book-card",
  ".stage-chip",
  ".choice-chip",
  ".origin-card",
  ".tone-card",
  ".spawn-card",
  ".decision-card",
  ".store-filters button",
  ".priority-options button",
  ".sw-bond-options button",
  ".god-entry",
].join(",");

let installed = false;

export function installRipple() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (document.documentElement.dataset.input === "keyboard") return;
      if (document.querySelector('.app-shell[data-motion="off"]')) return;
      const host = event.target?.closest?.(TARGETS);
      if (!host || host.disabled) return;
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      host.classList.add("ripple-host");
      const ink = document.createElement("span");
      const size = Math.max(rect.width, rect.height) * 2.2;
      ink.className = "ripple-ink";
      ink.style.width = ink.style.height = `${size}px`;
      ink.style.left = `${event.clientX - rect.left}px`;
      ink.style.top = `${event.clientY - rect.top}px`;
      ink.addEventListener("animationend", () => ink.remove());
      window.setTimeout(() => ink.remove(), 1200);
      host.appendChild(ink);
    },
    { passive: true },
  );
}
