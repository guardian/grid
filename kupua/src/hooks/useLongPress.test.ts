/**
 * @vitest-environment jsdom
 */

/**
 * Tests for useLongPress hook.
 *
 * Covers:
 * - Long-press fires onLongPressStart after LONG_PRESS_MS (fake timers).
 * - Movement > LONG_PRESS_MOVE_TOLERANCE_PX before threshold cancels.
 * - Scroll before threshold cancels.
 * - Non-touch pointer (mouse) is ignored.
 * - Tickbox target ([data-tickbox]) is skipped -- tickbox owns its event.
 * - Long-press on background (no data-cell-id) passes empty string to callback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLongPress } from "./useLongPress";
import { LONG_PRESS_MS, LONG_PRESS_MOVE_TOLERANCE_PX } from "@/constants/tuning";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a container div and attach it to the document body. */
function createContainer(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

/** Create a child element with data-cell-id. */
function createCell(parent: HTMLElement, id: string): HTMLDivElement {
  const cell = document.createElement("div");
  cell.dataset.cellId = id;
  parent.appendChild(cell);
  return cell;
}

/** Fire a PointerEvent on an element. */
function firePointer(
  el: EventTarget,
  type: string,
  opts: Partial<PointerEventInit> = {},
): void {
  el.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 100,
      ...opts,
    }),
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useLongPress -- threshold timing", () => {
  it("fires onLongPressStart after LONG_PRESS_MS without movement", () => {
    const container = createContainer();
    const cell = createCell(container, "img-1");
    const onStart = vi.fn();

    renderHook(() => {
      const ref = { current: container };
      useLongPress({
        containerRef: ref,
        onLongPressStart: onStart,
      });
    });

    firePointer(cell, "pointerdown");
    expect(onStart).not.toHaveBeenCalled();

    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onStart).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith("img-1", 100, 100);
  });
});

describe("useLongPress -- movement cancellation", () => {
  it("cancels when pointer moves more than LONG_PRESS_MOVE_TOLERANCE_PX", () => {
    const container = createContainer();
    const cell = createCell(container, "img-2");
    const onStart = vi.fn();

    renderHook(() => {
      useLongPress({
        containerRef: { current: container },
        onLongPressStart: onStart,
      });
    });

    firePointer(cell, "pointerdown", { clientX: 100, clientY: 100 });
    // Move beyond tolerance
    firePointer(container, "pointermove", {
      clientX: 100 + LONG_PRESS_MOVE_TOLERANCE_PX + 1,
      clientY: 100,
    });

    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("does NOT cancel when movement is within tolerance", () => {
    const container = createContainer();
    const cell = createCell(container, "img-3");
    const onStart = vi.fn();

    renderHook(() => {
      useLongPress({
        containerRef: { current: container },
        onLongPressStart: onStart,
      });
    });

    firePointer(cell, "pointerdown", { clientX: 100, clientY: 100 });
    firePointer(container, "pointermove", {
      clientX: 100 + LONG_PRESS_MOVE_TOLERANCE_PX - 1,
      clientY: 100,
    });

    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(onStart).toHaveBeenCalledOnce();
  });
});

describe("useLongPress -- scroll cancellation", () => {
  it("cancels when a scroll event fires before threshold", () => {
    const container = createContainer();
    const cell = createCell(container, "img-4");
    const onStart = vi.fn();

    renderHook(() => {
      useLongPress({
        containerRef: { current: container },
        onLongPressStart: onStart,
      });
    });

    firePointer(cell, "pointerdown");
    container.dispatchEvent(new Event("scroll", { bubbles: false }));

    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe("useLongPress -- non-touch pointer is ignored", () => {
  it("does not fire for mouse pointerdown", () => {
    const container = createContainer();
    const onStart = vi.fn();

    renderHook(() => {
      useLongPress({
        containerRef: { current: container },
        onLongPressStart: onStart,
      });
    });

    container.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        pointerType: "mouse",
        clientX: 100,
        clientY: 100,
      }),
    );

    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe("useLongPress -- tickbox guard", () => {
  it("does not fire when pointerdown target has [data-tickbox]", () => {
    const container = createContainer();
    const tickbox = document.createElement("button");
    tickbox.setAttribute("data-tickbox", "");
    container.appendChild(tickbox);

    const onStart = vi.fn();

    renderHook(() => {
      useLongPress({
        containerRef: { current: container },
        onLongPressStart: onStart,
      });
    });

    tickbox.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        pointerType: "touch",
        clientX: 50,
        clientY: 50,
      }),
    );

    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe("useLongPress -- pointercancel cleanup", () => {
  it("cancels on pointercancel without firing callbacks", () => {
    const container = createContainer();
    const cell = createCell(container, "img-6");
    const onStart = vi.fn();

    renderHook(() => {
      useLongPress({
        containerRef: { current: container },
        onLongPressStart: onStart,
      });
    });

    firePointer(cell, "pointerdown");
    firePointer(container, "pointercancel");

    vi.advanceTimersByTime(LONG_PRESS_MS + 50);
    expect(onStart).not.toHaveBeenCalled();
  });
});
