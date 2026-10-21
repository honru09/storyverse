import test from "node:test";
import assert from "node:assert/strict";
import { motionPolicy } from "../src/motion/policy.js";

const desktop = Object.freeze({
  wideViewport: true,
  coarsePointer: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
});

const allMotion = { animate: true, smoothScroll: true, atmosphere: true };
const lightweightOnly = {
  animate: true,
  smoothScroll: false,
  atmosphere: false,
};
const noMotion = { animate: false, smoothScroll: false, atmosphere: false };

test("default policy permits lightweight motion without assuming a desktop", () => {
  assert.deepEqual(motionPolicy(), lightweightOnly);
  assert.deepEqual(motionPolicy({}), lightweightOnly);
});

test("a visible capable desktop enables all three motion layers", () => {
  assert.deepEqual(motionPolicy(desktop), allMotion);
});

test("phone, wide touch devices and narrow desktop windows keep native scrolling", () => {
  for (const viewport of [
    { wideViewport: false, coarsePointer: true },
    { wideViewport: true, coarsePointer: true },
    { wideViewport: false, coarsePointer: false },
  ]) {
    assert.deepEqual(
      motionPolicy({ ...desktop, ...viewport }),
      lightweightOnly,
    );
  }
});

test("manual off disables motion even on a capable desktop", () => {
  assert.deepEqual(motionPolicy({ ...desktop, enabled: false }), noMotion);
});

test("reduced-motion preference disables every motion layer", () => {
  assert.deepEqual(motionPolicy({ ...desktop, reducedMotion: true }), noMotion);
  assert.deepEqual(
    motionPolicy({ coarsePointer: true, reducedMotion: true }),
    noMotion,
  );
});

test("data-saver preference disables every motion layer", () => {
  assert.deepEqual(motionPolicy({ ...desktop, saveData: true }), noMotion);
  assert.deepEqual(
    motionPolicy({ coarsePointer: true, saveData: true }),
    noMotion,
  );
});

test("hidden pages disable continuous layers while retaining the entrance-motion preference", () => {
  assert.deepEqual(
    motionPolicy({ ...desktop, visible: false }),
    lightweightOnly,
  );
});

test("the reader always uses native scrolling and no GPU atmosphere", () => {
  assert.deepEqual(
    motionPolicy({ ...desktop, view: "reader" }),
    lightweightOnly,
  );
});

test("non-reader scenes may use continuous layers on a capable desktop", () => {
  for (const view of ["home", "forge", "store", "merge"]) {
    assert.deepEqual(motionPolicy({ ...desktop, view }), allMotion, view);
  }
});

test("low memory disables only the GPU layer, including the 4 GB boundary", () => {
  for (const deviceMemory of [0.5, 1, 2, 4]) {
    assert.deepEqual(motionPolicy({ ...desktop, deviceMemory }), {
      animate: true,
      smoothScroll: true,
      atmosphere: false,
    });
  }
  assert.deepEqual(motionPolicy({ ...desktop, deviceMemory: 8 }), allMotion);
});

test("low core counts disable only the GPU layer, including the 4-core boundary", () => {
  for (const hardwareConcurrency of [1, 2, 4]) {
    assert.deepEqual(motionPolicy({ ...desktop, hardwareConcurrency }), {
      animate: true,
      smoothScroll: true,
      atmosphere: false,
    });
  }
  assert.deepEqual(
    motionPolicy({ ...desktop, hardwareConcurrency: 8 }),
    allMotion,
  );
});

test("either low hardware hint wins over the other capable hint", () => {
  for (const hints of [
    { deviceMemory: 4, hardwareConcurrency: 16 },
    { deviceMemory: 16, hardwareConcurrency: 4 },
    { deviceMemory: 4, hardwareConcurrency: 4 },
  ]) {
    assert.deepEqual(motionPolicy({ ...desktop, ...hints }), {
      animate: true,
      smoothScroll: true,
      atmosphere: false,
    });
  }
});

test("missing and unrecognized hardware hints are unknown, not low-power evidence", () => {
  assert.deepEqual(motionPolicy({ wideViewport: true }), allMotion);
  for (const unknown of [undefined, null, NaN, Infinity, -Infinity, "4"]) {
    assert.deepEqual(
      motionPolicy({ ...desktop, deviceMemory: unknown }),
      allMotion,
    );
    assert.deepEqual(
      motionPolicy({ ...desktop, hardwareConcurrency: unknown }),
      allMotion,
    );
    assert.deepEqual(
      motionPolicy({
        ...desktop,
        deviceMemory: unknown,
        hardwareConcurrency: unknown,
      }),
      allMotion,
    );
  }
});

test("unknown hardware cannot override a known low-power hint", () => {
  assert.equal(
    motionPolicy({
      ...desktop,
      deviceMemory: undefined,
      hardwareConcurrency: 4,
    }).atmosphere,
    false,
  );
  assert.equal(
    motionPolicy({
      ...desktop,
      deviceMemory: 4,
      hardwareConcurrency: undefined,
    }).atmosphere,
    false,
  );
});

test("global opt-outs take precedence over scene, visibility and device hints", () => {
  for (const optOut of [
    { enabled: false },
    { reducedMotion: true },
    { saveData: true },
    { enabled: false, reducedMotion: true, saveData: true },
  ]) {
    assert.deepEqual(
      motionPolicy({
        ...desktop,
        ...optOut,
        visible: false,
        view: "reader",
        deviceMemory: 2,
      }),
      noMotion,
    );
  }
});

test("policy is deterministic and leaves its input unchanged", () => {
  const input = Object.freeze({ ...desktop, view: "home", visible: true });
  const before = { ...input };
  const first = motionPolicy(input);
  const second = motionPolicy(input);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.deepEqual(input, before);
});
