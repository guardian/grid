/** @vitest-environment jsdom */

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toggleAppFullscreen } from "./app-fullscreen";

let stack: Element[];
const lock = vi.fn<() => Promise<void>>();
const unlock = vi.fn();
const exit = vi.fn();
const request = vi.fn();

function change() {
  document.dispatchEvent(new Event("fullscreenchange"));
}

function escape(options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...options });
  document.body.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  stack = [];
  lock.mockReset().mockResolvedValue(undefined);
  unlock.mockReset();
  request.mockReset().mockImplementation(async () => { stack.push(document.documentElement); change(); });
  exit.mockReset().mockImplementation(async () => { stack.pop(); change(); });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => stack.at(-1) ?? null });
  Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  Object.defineProperty(navigator, "keyboard", { configurable: true, value: { lock, unlock } });
});

afterEach(() => {
  stack = [];
  change();
  document.body.replaceChildren();
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document.documentElement, "requestFullscreen");
  Reflect.deleteProperty(document, "exitFullscreen");
  Reflect.deleteProperty(navigator, "keyboard");
});

async function enterApp() {
  toggleAppFullscreen();
  await Promise.resolve();
  await Promise.resolve();
}

it("short Escape exits only the inner fullscreen and preserves the app", async () => {
  await enterApp();
  expect(lock).toHaveBeenCalledExactlyOnceWith(["Escape"]);
  expect(escape().defaultPrevented).toBe(true);
  expect(exit).not.toHaveBeenCalled();
  stack.push(document.createElement("div"));
  change();
  expect(escape().defaultPrevented).toBe(true);
  expect(exit).toHaveBeenCalledOnce();
  expect(document.fullscreenElement).toBe(document.documentElement);
  expect(unlock).not.toHaveBeenCalled();
  expect(escape({ repeat: true }).defaultPrevented).toBe(true);
  expect(exit).toHaveBeenCalledOnce();
  expect(escape().defaultPrevented).toBe(true);
  expect(exit).toHaveBeenCalledOnce();
  expect(document.fullscreenElement).toBe(document.documentElement);
  expect(unlock).not.toHaveBeenCalled();
  toggleAppFullscreen();
  expect(document.fullscreenElement).toBeNull();
  expect(unlock).toHaveBeenCalledOnce();
});

it("leaves an open menu and already-handled Escape to their existing owners", async () => {
  await enterApp();
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  document.body.append(menu);
  escape();
  expect(exit).not.toHaveBeenCalled();
  menu.remove();
  const handled = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  handled.preventDefault();
  document.body.dispatchEvent(handled);
  expect(exit).not.toHaveBeenCalled();
});

it("does not double-exit when Crop's capture handler owns Escape", async () => {
  await enterApp();
  stack.push(document.createElement("div"));
  change();
  const cropEscape = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void document.exitFullscreen();
  };
  window.addEventListener("keydown", cropEscape, { capture: true, once: true });
  escape();
  expect(exit).toHaveBeenCalledOnce();
  expect(document.fullscreenElement).toBe(document.documentElement);
});

it("releases the lock on browser-driven full exit and removes its Escape handler", async () => {
  await enterApp();
  stack = [];
  change();
  expect(unlock).toHaveBeenCalledOnce();
  expect(escape().defaultPrevented).toBe(false);
  expect(exit).not.toHaveBeenCalled();
});

it("keeps ordinary fullscreen available when keyboard lock is unsupported", async () => {
  Reflect.deleteProperty(navigator, "keyboard");
  await enterApp();
  expect(document.fullscreenElement).toBe(document.documentElement);
  expect(escape().defaultPrevented).toBe(false);
  expect(exit).not.toHaveBeenCalled();
});

it("keeps ordinary fullscreen available when keyboard lock is rejected", async () => {
  lock.mockRejectedValue(new Error("Keyboard lock unavailable"));
  await enterApp();
  await Promise.resolve();
  expect(document.fullscreenElement).toBe(document.documentElement);
  expect(escape().defaultPrevented).toBe(false);
  expect(exit).not.toHaveBeenCalled();
});

it("does not install an Escape handler if fullscreen ends while lock is pending", async () => {
  let resolve!: () => void;
  lock.mockReturnValue(new Promise<void>(done => { resolve = done; }));
  await enterApp();
  stack = [];
  change();
  expect(unlock).toHaveBeenCalledOnce();
  resolve();
  await Promise.resolve();
  expect(escape().defaultPrevented).toBe(false);
  expect(exit).not.toHaveBeenCalled();
});

it("does not request keyboard lock when fullscreen entry fails", async () => {
  request.mockRejectedValue(new Error("Fullscreen unavailable"));
  await enterApp();
  expect(lock).not.toHaveBeenCalled();
  expect(escape().defaultPrevented).toBe(false);
});
