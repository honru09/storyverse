/*!
 * Adapted from React Bits AnimatedContent, Copyright (c) 2026 David Haz.
 * Source: https://github.com/DavidHDev/react-bits/blob/main/src/content/Animations/AnimatedContent/AnimatedContent.jsx
 * License: MIT + Commons Clause. See LICENSE.md in this directory.
 * Local changes: useGSAP-scoped cleanup, motion policy, interaction-to-reveal,
 * visible-by-default markup, quiet travel and no disappearing content.
 */
import React, { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP } from "../../motion/gsap.js";
import { useMotionPolicy } from "../../motion/MotionProvider.jsx";
import { isKeyboardInput, subscribeInputModality } from "../../motion/input-modality.js";

export default function AnimatedContent({
  children,
  distance = 8,
  direction = "vertical",
  reverse = false,
  duration = 0.22,
  ease = "power3.out",
  initialOpacity = 0.72,
  animateOpacity = true,
  scale = 1,
  threshold = 0.05,
  delay = 0,
  className = "",
  ...props
}) {
  const ref = useRef(null);
  const { animate } = useMotionPolicy();
  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !animate || isKeyboardInput()) return;
      const axis = direction === "horizontal" ? "x" : "y";
      const offset = reverse ? -distance : distance;
      gsap.set(el, {
        [axis]: offset,
        scale,
        opacity: animateOpacity ? initialOpacity : 1,
      });
      const tl = gsap.timeline({ paused: true, delay });
      tl.to(el, {
        [axis]: 0,
        scale: 1,
        opacity: 1,
        duration,
        ease,
        clearProps: "transform,opacity",
      });
      const trigger = ScrollTrigger.create({
        trigger: el,
        start: `top ${(1 - threshold) * 100}%`,
        once: true,
        onEnter: () => isKeyboardInput() ? tl.progress(1).pause() : tl.play(),
      });
      // Input takes priority over the reveal, including touch that skips focus.
      const reveal = () => {
        tl.progress(1).pause();
        trigger.kill();
      };
      const unsubscribeInput = subscribeInputModality((keyboard) => {
        if (keyboard) reveal();
      });
      el.addEventListener("focusin", reveal);
      el.addEventListener("pointerdown", reveal);
      return () => {
        unsubscribeInput();
        el.removeEventListener("focusin", reveal);
        el.removeEventListener("pointerdown", reveal);
        trigger.kill();
        tl.kill();
      };
    },
    {
      scope: ref,
      dependencies: [
        animate,
        distance,
        direction,
        reverse,
        duration,
        ease,
        initialOpacity,
        animateOpacity,
        scale,
        threshold,
        delay,
      ],
      revertOnUpdate: true,
    },
  );
  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  );
}
