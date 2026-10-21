import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { gsap, ScrollTrigger, useGSAP } from "./gsap.js";
import { useMotionPolicy } from "./MotionProvider.jsx";

const SCROLL_RESET = "storyweave:scroll-reset";
export function scrollToTop() {
  window.dispatchEvent(new Event(SCROLL_RESET));
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function useSmoothScroll(view) {
  const { smoothScroll } = useMotionPolicy(view);
  useEffect(() => {
    if (!smoothScroll) return;
    const lenis = new Lenis({
      autoRaf: false,
      lerp: 0.13,
      smoothWheel: true,
      syncTouch: false,
      anchors: true,
      prevent: (node) =>
        Boolean(
          node.closest?.(
            "dialog, [data-lenis-prevent], input, textarea, select",
          ),
        ),
    });
    const tick = (time) => lenis.raf(time * 1000);
    const reset = () => lenis.scrollTo(0, { immediate: true, force: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(tick);
    window.addEventListener(SCROLL_RESET, reset);
    return () => {
      window.removeEventListener(SCROLL_RESET, reset);
      gsap.ticker.remove(tick);
      lenis.off("scroll", ScrollTrigger.update);
      lenis.destroy();
    };
  }, [smoothScroll, view]);
}

export function useSceneMotion(scope, key, selector, { quiet = false } = {}) {
  const { animate } = useMotionPolicy();
  useGSAP(
    () => {
      if (!animate || !scope.current) return;
      const targets = Array.from(scope.current.querySelectorAll(selector));
      if (!targets.length) return;
      gsap.from(targets, {
        y: quiet ? 0 : 8,
        opacity: quiet ? 0.8 : 0.65,
        duration: quiet ? 0.14 : 0.22,
        stagger: quiet ? 0 : 0.03,
        ease: "power3.out",
        clearProps: "opacity,transform",
      });
      ScrollTrigger.refresh();
    },
    {
      scope,
      dependencies: [key, animate, selector, quiet],
      revertOnUpdate: true,
    },
  );
}
