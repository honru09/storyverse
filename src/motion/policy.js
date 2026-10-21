// One policy for the scroll, animation and atmosphere layers. Missing hardware
// hints are unknown, not evidence of a slow device.
export function motionPolicy({
  enabled = true,
  reducedMotion = false,
  coarsePointer = false,
  wideViewport = false,
  saveData = false,
  deviceMemory,
  hardwareConcurrency,
  visible = true,
  view = "home",
} = {}) {
  const lowPower =
    (Number.isFinite(deviceMemory) && deviceMemory <= 4) ||
    (Number.isFinite(hardwareConcurrency) && hardwareConcurrency <= 4);
  const motion = enabled && !reducedMotion && !saveData;
  const desktop = wideViewport && !coarsePointer;
  return {
    animate: motion,
    smoothScroll: motion && desktop && view !== "reader" && visible,
    atmosphere: motion && desktop && !lowPower && visible && view !== "reader",
  };
}
