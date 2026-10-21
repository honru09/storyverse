import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);
// Lenis owns the clock conversion, GSAP owns the single shared ticker.
gsap.ticker.lagSmoothing(0);

export { gsap, ScrollTrigger, useGSAP };
