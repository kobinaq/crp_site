import { Window } from "happy-dom";

export function installDom() {
  const win = new Window({ url: "http://localhost/admin/copy" });
  const names = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "DocumentFragment",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLButtonElement",
    "HTMLFormElement",
    "HTMLSelectElement",
    "HTMLIFrameElement",
    "HTMLVideoElement",
    "HTMLAudioElement",
    "HTMLImageElement",
    "SVGElement",
    "Event",
    "InputEvent",
    "KeyboardEvent",
    "MouseEvent",
    "PointerEvent",
    "FocusEvent",
    "CustomEvent",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ];
  for (const name of names) {
    const value = name === "getComputedStyle" || name === "requestAnimationFrame" || name === "cancelAnimationFrame"
      ? win[name].bind(win)
      : win[name];
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return win;
}

export function setControlValue(element, value) {
  const prototype = element instanceof globalThis.HTMLTextAreaElement
    ? globalThis.HTMLTextAreaElement.prototype
    : globalThis.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
  element.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
}
