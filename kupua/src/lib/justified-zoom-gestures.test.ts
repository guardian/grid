// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindJustifiedZoomGestures } from "./justified-zoom-gestures";

function fixture() {
  const container = document.createElement("div");
  const first = document.createElement("img");
  const second = document.createElement("img");
  container.append(first, second);
  document.body.append(container);
  const transition = { begin: vi.fn(), update: vi.fn(), end: vi.fn(), layout: vi.fn(), interrupt: vi.fn(), external: vi.fn(), dispose: vi.fn() };
  const pinchAnchor = { capture: vi.fn(), clear: vi.fn() };
  const dispose = bindJustifiedZoomGestures(container, transition, pinchAnchor);
  const touch = (target: EventTarget, x: number, y: number, identifier = target === second ? 2 : 1) => ({ target, clientX: x, clientY: y, identifier });
  const a = touch(first, 100, 200);
  const b = touch(second, 300, 400);
  const send = (target: EventTarget, type: string, touches: typeof a[]) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: touches });
    target.dispatchEvent(event);
    return event;
  };
  return { container, first, second, transition, pinchAnchor, dispose, touch, a, b, send };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("native-touch contact ownership", () => {
  it("leaves one-finger scrolling alone, but owns a deliberate two-finger gesture", () => {
    const f = fixture();
    expect(f.send(f.first, "touchstart", [f.a]).defaultPrevented).toBe(false);
    expect(f.send(f.first, "touchmove", [f.a]).defaultPrevented).toBe(false);
    expect(f.transition.begin).not.toHaveBeenCalled();
    expect(f.send(f.second, "touchstart", [f.a, f.b]).defaultPrevented).toBe(true);
    expect(f.transition.begin).toHaveBeenCalledExactlyOnceWith(200, 300);
    expect(f.pinchAnchor.capture).toHaveBeenCalledExactlyOnceWith(200, 300);
    expect(f.pinchAnchor.clear).not.toHaveBeenCalled();
    const move = f.send(f.first, "touchmove", [f.touch(f.first, 120, 220), f.touch(f.second, 280, 380)]);
    expect(move.defaultPrevented).toBe(true);
    expect(f.transition.update).toHaveBeenCalledExactlyOnceWith(0.8);
    f.send(f.first, "touchend", [f.b]);
    f.send(f.second, "touchend", []);
    expect(f.transition.end).toHaveBeenCalledExactlyOnceWith(false);
    expect(f.pinchAnchor.clear.mock.invocationCallOrder[0]).toBeGreaterThan(f.transition.end.mock.invocationCallOrder[0]);
    f.dispose();
  });

  it("installs non-passive move listeners only after a valid pinch starts", () => {
    const f = fixture();
    const listen = vi.spyOn(f.first, "addEventListener");
    const remove = vi.spyOn(f.first, "removeEventListener");
    f.send(f.first, "touchstart", [f.a]);
    expect(listen.mock.calls.map(([type]) => type)).toEqual(["touchend", "touchcancel"]);
    expect(f.send(f.first, "touchmove", [f.a]).defaultPrevented).toBe(false);
    expect(f.transition.update).not.toHaveBeenCalled();
    f.send(f.second, "touchstart", [f.a, f.b]);
    expect(listen.mock.calls.filter(([type]) => type === "touchmove")).toHaveLength(1);
    expect(listen).toHaveBeenCalledWith("touchmove", expect.any(Function), { capture: true, passive: false });
    expect(f.send(f.first, "touchmove", [f.a, f.b]).defaultPrevented).toBe(true);
    expect(f.transition.update).toHaveBeenCalledExactlyOnceWith(1);
    f.send(f.first, "touchend", [f.b]);
    f.send(f.second, "touchend", []);
    expect(remove).toHaveBeenCalledWith("touchmove", expect.any(Function), true);
    f.dispose();
  });

  it("does not claim a contact that began outside results", () => {
    const f = fixture();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const other = f.touch(outside, 300, 400, 3);
    expect(f.send(f.first, "touchstart", [other, f.a]).defaultPrevented).toBe(false);
    f.send(f.first, "touchmove", [other, f.a]);
    expect(f.transition.begin).not.toHaveBeenCalled();
    expect(f.transition.update).not.toHaveBeenCalled();
    f.dispose();
  });

  it("keeps contact identity across ordering changes and cancels replacement contacts", () => {
    const f = fixture();
    f.send(f.second, "touchstart", [f.a, f.b]);
    f.send(f.second, "touchmove", [f.b, f.a]);
    expect(f.transition.update).toHaveBeenCalledExactlyOnceWith(1);
    const replacement = f.touch(f.second, 250, 350, 3);
    f.send(f.first, "touchmove", [f.a, replacement]);
    expect(f.transition.update).toHaveBeenCalledTimes(1);
    expect(f.transition.end).toHaveBeenCalledExactlyOnceWith(true);
    f.send(f.first, "touchstart", [f.a, replacement]);
    expect(f.transition.begin).toHaveBeenCalledTimes(1);
    f.send(f.first, "touchend", []);
    f.send(f.second, "touchstart", [f.a, f.b]);
    expect(f.transition.begin).toHaveBeenCalledTimes(2);
    f.dispose();
  });

  it("observes an outside remaining contact so cancellation cannot strand the latch", () => {
    const f = fixture();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const third = f.touch(outside, 250, 350, 3);
    f.send(f.second, "touchstart", [f.a, f.b]);
    f.send(f.first, "touchend", [f.b, third]);
    expect(f.transition.end).toHaveBeenCalledExactlyOnceWith(true);
    f.send(f.second, "touchend", [third]);
    f.send(outside, "touchend", []);
    f.send(f.second, "touchstart", [f.a, f.b]);
    expect(f.transition.begin).toHaveBeenCalledTimes(2);
    f.dispose();
  });

  it("remembers a local first contact detached by one-finger scrolling", () => {
    const f = fixture();
    f.send(f.first, "touchstart", [f.a]);
    f.first.remove();
    f.send(f.second, "touchstart", [f.a, f.b]);
    expect(f.transition.begin).toHaveBeenCalledTimes(1);
    f.send(f.first, "touchmove", [f.a, f.b]);
    expect(f.transition.update).toHaveBeenCalledExactlyOnceWith(1);
    f.send(f.first, "touchend", [f.b]);
    f.send(f.second, "touchend", []);
    f.dispose();
  });

  it("does not mistake a reused identifier on an outside contact for an earlier local touch", () => {
    const f = fixture();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    f.send(f.first, "touchstart", [f.a]);
    f.send(f.first, "touchend", []);
    const other = f.touch(outside, 100, 200, f.a.identifier);
    f.send(f.second, "touchstart", [other, f.b]);
    expect(f.transition.begin).not.toHaveBeenCalled();
    f.dispose();
  });

  it("keeps move and release events when repacking detaches both touched cells", () => {
    const f = fixture();
    f.send(f.second, "touchstart", [f.a, f.b]);
    f.container.replaceChildren();
    f.send(f.first, "touchmove", [f.touch(f.first, 120, 220), f.touch(f.second, 280, 380)]);
    expect(f.transition.update).toHaveBeenCalledExactlyOnceWith(0.8);
    f.send(f.first, "touchend", [f.b]);
    f.send(f.second, "touchend", []);
    expect(f.transition.end).toHaveBeenCalledExactlyOnceWith(false);
    f.send(f.first, "touchmove", [f.a, f.b]);
    expect(f.transition.update).toHaveBeenCalledTimes(1);
    f.dispose();
  });

  it("does not turn a finger recontact into another zoom level", () => {
    const f = fixture();
    f.send(f.second, "touchstart", [f.a, f.b]);
    f.send(f.first, "touchend", [f.b]);
    f.send(f.first, "touchstart", [f.a, f.b]);
    f.send(f.first, "touchmove", [f.a, f.b]);
    f.send(f.first, "touchend", [f.b]);
    f.send(f.second, "touchend", []);
    expect(f.transition.begin).toHaveBeenCalledTimes(1);
    expect(f.transition.end).toHaveBeenCalledTimes(1);
    f.send(f.second, "touchstart", [f.a, f.b]);
    expect(f.transition.begin).toHaveBeenCalledTimes(2);
    f.dispose();
  });

  it("deduplicates bubbling through nested origins and cancels a third contact", () => {
    const f = fixture();
    f.first.replaceWith(f.second);
    const child = document.createElement("span");
    f.second.appendChild(child);
    const a = f.touch(child, 100, 200);
    f.send(f.second, "touchstart", [a, f.b]);
    f.send(child, "touchmove", [a, f.b]);
    expect(f.transition.update).toHaveBeenCalledTimes(1);
    const third = document.createElement("div");
    f.container.appendChild(third);
    const c = f.touch(third, 200, 300);
    f.send(third, "touchstart", [a, f.b, c]);
    expect(f.transition.interrupt).toHaveBeenCalledTimes(1);
    f.send(child, "touchend", [f.b, c]);
    f.send(f.second, "touchend", [c]);
    f.send(third, "touchend", []);
    f.send(f.second, "touchstart", [a, f.b]);
    expect(f.transition.begin).toHaveBeenCalledTimes(2);
    f.dispose();
  });

  it("rolls back a genuine cancellation and removes detached-node listeners on blur/disposal", () => {
    const f = fixture();
    f.send(f.second, "touchstart", [f.a, f.b]);
    f.send(f.first, "touchcancel", []);
    expect(f.transition.end).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.pinchAnchor.clear).toHaveBeenCalledOnce();
    f.send(f.second, "touchstart", [f.a, f.b]);
    f.container.replaceChildren();
    window.dispatchEvent(new Event("blur"));
    expect(f.pinchAnchor.clear).toHaveBeenCalledTimes(2);
    f.send(f.first, "touchmove", [f.a, f.b]);
    expect(f.transition.update).not.toHaveBeenCalled();
    f.dispose();
    f.send(f.second, "touchend", []);
    expect(f.transition.end).toHaveBeenCalledTimes(1);
  });

  it("releases detached contacts when hidden and accepts a fresh sequence after resume", () => {
    const f = fixture();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    f.send(f.second, "touchstart", [f.a, f.b]);
    f.container.replaceChildren();
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    f.send(f.first, "touchmove", [f.a, f.b]);
    expect(f.transition.update).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    f.container.append(f.first, f.second);
    f.send(f.second, "touchstart", [f.a, f.b]);
    expect(f.transition.begin).toHaveBeenCalledTimes(2);
    f.send(f.first, "touchend", [f.b]);
    f.send(f.second, "touchend", []);
    expect(f.transition.end).toHaveBeenCalledExactlyOnceWith(false);
    f.dispose();
  });

  it("keeps wheel gesture completion separate from native touch contacts", () => {
    vi.useFakeTimers();
    const f = fixture();
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -40 });
    f.container.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(f.transition.begin).toHaveBeenCalledTimes(1);
    expect(f.transition.update).toHaveBeenCalledTimes(1);
    expect(f.pinchAnchor.capture).not.toHaveBeenCalled();
    vi.advanceTimersByTime(140);
    expect(f.transition.end).toHaveBeenCalledTimes(1);
    f.dispose();
    vi.advanceTimersByTime(500);
    expect(f.transition.end).toHaveBeenCalledTimes(1);
  });
});
