const CHANGE_EVENT = "storyweave:input-modality";
const ATTRIBUTE = "data-input";

export function isKeyboardInput(target = globalThis.document) {
  return target?.documentElement?.getAttribute(ATTRIBUTE) === "keyboard";
}

// Capture input before React dispatches an action. Reading this synchronously
// avoids starting an entrance with the previous render's input modality.
export function observeInputModality(target = globalThis.document) {
  const root = target?.documentElement;
  if (!root) return () => {};
  const previous = root.getAttribute(ATTRIBUTE);
  const update = (input) => {
    if (root.getAttribute(ATTRIBUTE) === input) return;
    root.setAttribute(ATTRIBUTE, input);
    target.dispatchEvent(new Event(CHANGE_EVENT));
  };
  const keyboard = () => update("keyboard");
  const pointer = () => update("pointer");
  // Assistive technology can activate controls without a preceding key event.
  const click = (event) => {
    if (event.detail === 0) keyboard();
  };
  const capture = { capture: true };
  const passiveCapture = { capture: true, passive: true };
  root.setAttribute(ATTRIBUTE, previous || "initial");
  target.addEventListener("keydown", keyboard, capture);
  target.addEventListener("click", click, capture);
  target.addEventListener("pointerdown", pointer, passiveCapture);
  target.addEventListener("wheel", pointer, passiveCapture);
  return () => {
    target.removeEventListener("keydown", keyboard, capture);
    target.removeEventListener("click", click, capture);
    target.removeEventListener("pointerdown", pointer, passiveCapture);
    target.removeEventListener("wheel", pointer, passiveCapture);
    if (previous === null) root.removeAttribute(ATTRIBUTE);
    else root.setAttribute(ATTRIBUTE, previous);
  };
}

export function subscribeInputModality(listener, target = globalThis.document) {
  if (!target) return () => {};
  const notify = () => listener(isKeyboardInput(target));
  target.addEventListener(CHANGE_EVENT, notify);
  return () => target.removeEventListener(CHANGE_EVENT, notify);
}
