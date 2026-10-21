import test from "node:test";
import assert from "node:assert/strict";
import {
  isKeyboardInput,
  observeInputModality,
  subscribeInputModality,
} from "../src/motion/input-modality.js";

function documentTarget(initial) {
  const attributes = new Map(initial ? [["data-input", initial]] : []);
  const target = new EventTarget();
  target.documentElement = {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
  };
  return target;
}

function click(detail) {
  const event = new Event("click");
  Object.defineProperty(event, "detail", { value: detail });
  return event;
}

test("keyboard modality is available synchronously before the action handler runs", () => {
  const target = documentTarget();
  const dispose = observeInputModality(target);
  let observedByAction;
  target.addEventListener("keydown", () => {
    observedByAction = isKeyboardInput(target);
  });
  target.dispatchEvent(new Event("keydown"));
  assert.equal(observedByAction, true);
  dispose();
});

test("assistive activation is instant without requiring a keydown", () => {
  const target = documentTarget();
  const dispose = observeInputModality(target);
  target.dispatchEvent(new Event("pointerdown"));
  assert.equal(isKeyboardInput(target), false);
  target.dispatchEvent(click(0));
  assert.equal(isKeyboardInput(target), true);
  dispose();
});

test("an intentional pointer gesture restores future motion without duplicate notifications", () => {
  const target = documentTarget();
  const dispose = observeInputModality(target);
  const changes = [];
  const unsubscribe = subscribeInputModality((keyboard) => changes.push(keyboard), target);
  target.dispatchEvent(new Event("keydown"));
  target.dispatchEvent(new Event("keydown"));
  target.dispatchEvent(new Event("pointerdown"));
  target.dispatchEvent(click(1));
  assert.deepEqual(changes, [true, false]);
  assert.equal(isKeyboardInput(target), false);
  unsubscribe();
  dispose();
});

test("wheel input can return from keyboard mode to pointer scrolling", () => {
  const target = documentTarget();
  const dispose = observeInputModality(target);
  target.dispatchEvent(new Event("keydown"));
  target.dispatchEvent(new Event("wheel"));
  assert.equal(isKeyboardInput(target), false);
  dispose();
});

test("unmount removes capture listeners and restores the original document attribute", () => {
  for (const initial of [undefined, "pointer"]) {
    const target = documentTarget(initial);
    const dispose = observeInputModality(target);
    target.dispatchEvent(new Event("keydown"));
    dispose();
    assert.equal(target.documentElement.getAttribute("data-input"), initial ?? null);
    target.dispatchEvent(new Event("keydown"));
    assert.equal(target.documentElement.getAttribute("data-input"), initial ?? null);
  }
});

test("disposed subscribers do not receive subsequent input changes", () => {
  const target = documentTarget();
  const dispose = observeInputModality(target);
  let changes = 0;
  const unsubscribe = subscribeInputModality(() => { changes += 1; }, target);
  target.dispatchEvent(new Event("keydown"));
  unsubscribe();
  target.dispatchEvent(new Event("pointerdown"));
  assert.equal(changes, 1);
  dispose();
});

test("non-browser environments remain safe", () => {
  assert.equal(isKeyboardInput(undefined), false);
  assert.doesNotThrow(() => observeInputModality(undefined)());
  assert.doesNotThrow(() => subscribeInputModality(() => {}, undefined)());
});
