import React, { useEffect, useRef, useState } from "react";
import { useMotionPolicy } from "./MotionProvider.jsx";
import "./atmosphere.css";

// Vanta gets an empty node of its own: it must never rewrite content styles.
export default function WorldAtmosphere({ variant = "tide" }) {
  const hostRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState(false);
  const { atmosphere } = useMotionPolicy();
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.02 },
    );
    observer.observe(hostRef.current);
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    if (!atmosphere || !inView || !pageVisible || failed) return;
    let disposed = false;
    let effect;
    let renderer;
    let canvas;
    const onContextLost = () => {
      if (!disposed) setFailed(true);
    };
    const release = () => {
      canvas?.removeEventListener("webglcontextlost", onContextLost);
      // A failed Vanta init may already have detached its canvas. One failed
      // cleanup step must not prevent the remaining GPU resources being freed.
      try {
        effect?.destroy();
      } catch {
        canvas?.remove();
      }
      try {
        renderer?.dispose();
      } catch {
        /* A partially created renderer is disposable. */
      }
      try {
        renderer?.forceContextLoss();
      } catch {
        /* Context may already be lost. */
      }
      effect = null;
      renderer = null;
    };
    // The pinned package's ESM source avoids the UMD double-default export in
    // Vite's dev optimizer, while keeping dev and production on the same API.
    Promise.all([import("./three-waves.js"), import("vanta/src/vanta.waves.js")])
      .then(([THREE, module]) => {
        if (disposed) return;
        try {
          effect = module.default({
            el: hostRef.current,
            THREE,
            mouseControls: false,
            touchControls: false,
            gyroControls: false,
            minHeight: 120,
            minWidth: 120,
            color: variant === "merge" ? 0x376461 : 0x477b79,
            shininess: 18,
            waveHeight: 9,
            waveSpeed: 0.3,
            zoom: 0.85,
            scale: Math.max(1.5, window.devicePixelRatio || 1),
            scaleMobile: 2,
          });
          renderer = effect.renderer;
          canvas = renderer?.domElement;
          if (!canvas || !renderer || !hostRef.current?.contains(canvas))
            throw new Error("Atmosphere unavailable");
          canvas.addEventListener("webglcontextlost", onContextLost);
          setLive(true);
        } catch (error) {
          release();
          if (!disposed) setFailed(true);
          if (import.meta.env.DEV)
            console.warn("[Storyweave] Using static atmosphere:", error);
        }
      })
      .catch((error) => {
        if (!disposed) setFailed(true);
        if (import.meta.env.DEV)
          console.warn("[Storyweave] Atmosphere module unavailable:", error);
      });
    return () => {
      disposed = true;
      release();
      setLive(false);
    };
  }, [atmosphere, inView, pageVisible, failed, variant]);
  const status = failed
    ? "unavailable"
    : !atmosphere
      ? "device-policy"
      : !inView || !pageVisible
        ? "offscreen"
        : live
          ? "ready"
          : "loading";
  return (
    <div
      className={`world-atmosphere atmosphere-${variant} ${!inView || !pageVisible ? "is-offscreen" : ""}`}
      aria-hidden="true"
      data-atmosphere={live ? "live" : "static"}
      data-atmosphere-status={status}
      data-animation-active={live && inView && pageVisible ? "true" : "false"}
    >
      <div className="world-atmosphere-fallback">
        <svg
          viewBox="0 0 600 500"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          <path
            d="M-80 380C80 230 190 470 380 315S650 180 740 285V600H-80Z"
            fill="#91b5aa"
          />
          <path
            d="M-80 420C80 290 180 520 380 350S650 230 740 330"
            fill="none"
            stroke="#476f65"
            strokeWidth="2"
          />
          <path
            d="M-80 448C80 330 190 550 390 395S650 270 740 370V600H-80Z"
            fill="#629186"
          />
          <path
            d="M-80 470C90 355 200 585 400 425S650 300 740 410"
            fill="none"
            stroke="#264e46"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="world-atmosphere-canvas" ref={hostRef} />
    </div>
  );
}
