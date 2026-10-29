import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { gsap, ScrollTrigger, useGSAP } from "./gsap.js";
import { useMotionPolicy } from "./MotionProvider.jsx";
import { isKeyboardInput, subscribeInputModality } from "./input-modality.js";

const SCROLL_RESET = "storyweave:scroll-reset";
export function scrollToTop() {
  window.dispatchEvent(new Event(SCROLL_RESET));
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function useSmoothScroll(view) {
  const { smoothScroll } = useMotionPolicy(view);
  useEffect(() => {
    if (!smoothScroll) return;
    let disposed = false;
    let ticking = false;
    let elapsed = 0;
    let previousTick = null;
    const lenis = new Lenis({
      autoRaf: false,
      lerp: 0.13,
      smoothWheel: true,
      syncTouch: false,
      // Page hashes belong to navigation; native in-page links still work.
      anchors: false,
      prevent: (node) =>
        Boolean(
          node.closest?.(
            "dialog, [data-lenis-prevent], input, textarea, select",
          ),
        ),
    });
    const sleep = () => {
      gsap.ticker.remove(tick);
      ticking = false;
      previousTick = null;
    };
    const tick = (time) => {
      // Keep the animation clock continuous across idle periods so the next
      // gesture does not inherit minutes of elapsed time and jump to its end.
      if (previousTick !== null) elapsed += time - previousTick;
      previousTick = time;
      lenis.raf(elapsed * 1000);
      if (lenis.isScrolling !== "smooth") sleep();
    };
    const wake = () => {
      // Lenis emits virtual-scroll before it decides whether to handle it.
      // Wait until that decision so dialogs, zoom and native input do not
      // start a rendering loop. GSAP may tick synchronously when it wakes.
      queueMicrotask(() => {
        if (disposed || ticking || lenis.isScrolling !== "smooth") return;
        ticking = true;
        gsap.ticker.add(tick);
      });
    };
    const reset = () => {
      lenis.scrollTo(0, { immediate: true, force: true });
      sleep();
    };
    const unsubscribeInput = subscribeInputModality((keyboard) => {
      if (!keyboard || !ticking) return;
      // Keyboard scrolling must not compete with unfinished wheel inertia.
      lenis.scrollTo(window.scrollY, { immediate: true, force: true });
      sleep();
    });
    lenis.on("scroll", ScrollTrigger.update);
    lenis.on("virtual-scroll", wake);
    window.addEventListener(SCROLL_RESET, reset);
    return () => {
      disposed = true;
      unsubscribeInput();
      window.removeEventListener(SCROLL_RESET, reset);
      sleep();
      lenis.off("virtual-scroll", wake);
      lenis.off("scroll", ScrollTrigger.update);
      lenis.destroy();
    };
  }, [smoothScroll, view]);
}

export function useSceneMotion(scope, key, selector, { quiet = false } = {}) {
  const { animate } = useMotionPolicy();
  useGSAP(
    () => {
      if (!animate || isKeyboardInput() || !scope.current) return;
      const targets = Array.from(scope.current.querySelectorAll(selector));
      if (!targets.length) return;
      // SALT §51 (motion #5): entrances start from true zero opacity
      // over a 12px rise; the stagger is capped — item 7 onwards share
      // the 180ms mark instead of trailing in one by one.
      const entrance = gsap.from(targets, {
        y: quiet ? 0 : 12,
        opacity: quiet ? 0.8 : 0,
        duration: quiet ? 0.14 : 0.24,
        delay: quiet ? 0 : (index) => Math.min(index, 6) * 0.03,
        ease: "power3.out",
        clearProps: "opacity,transform",
      });
      // Tab or a shortcut during an entrance reveals the final state now.
      return subscribeInputModality((keyboard) => {
        if (keyboard) entrance.progress(1).pause();
      });
    },
    {
      scope,
      dependencies: [key, animate, selector, quiet],
      revertOnUpdate: true,
    },
  );
}
