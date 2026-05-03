/**
 * @vitest-environment jsdom
 */

/**
 * Toast store + ToastContainer tests.
 *
 * Covers:
 * - addToast adds to queue
 * - dismiss removes from queue
 * - queue overflow drops oldest
 * - lifespan / durationMs defaults
 * - _clearAll empties queue
 * - ToastContainer renders nothing when empty
 * - ToastContainer renders toasts (message, role=alert, data-category)
 * - ToastContainer dismiss button removes toast
 * - auto-dismiss via timer (transient + durationMs)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { useToastStore, addToast } from "@/stores/toast-store";
import { ToastContainer } from "@/components/ToastContainer";
import { TOAST_QUEUE_MAX, TOAST_DEFAULT_DURATION_MS } from "@/constants/tuning";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useToastStore.getState()._clearAll();
}

// ---------------------------------------------------------------------------
// Store unit tests
// ---------------------------------------------------------------------------

describe("toast-store", () => {
  beforeEach(resetStore);

  it("starts with an empty queue", () => {
    expect(useToastStore.getState().queue).toHaveLength(0);
  });

  it("addToast adds a toast with generated id", () => {
    addToast({ category: "information", message: "hello" });
    const { queue } = useToastStore.getState();
    expect(queue).toHaveLength(1);
    expect(queue[0].message).toBe("hello");
    expect(queue[0].category).toBe("information");
    expect(typeof queue[0].id).toBe("string");
    expect(queue[0].id.length).toBeGreaterThan(0);
  });

  it("defaults lifespan to 'transient' and durationMs to TOAST_DEFAULT_DURATION_MS", () => {
    addToast({ category: "warning", message: "w" });
    const t = useToastStore.getState().queue[0];
    expect(t.lifespan).toBe("transient");
    expect(t.durationMs).toBe(TOAST_DEFAULT_DURATION_MS);
  });

  it("accepts explicit lifespan and durationMs overrides", () => {
    addToast({ category: "error", message: "e", lifespan: "session", durationMs: 0 });
    const t = useToastStore.getState().queue[0];
    expect(t.lifespan).toBe("session");
    expect(t.durationMs).toBe(0);
  });

  it("dismiss removes the toast with matching id", () => {
    addToast({ category: "success", message: "s" });
    const id = useToastStore.getState().queue[0].id;
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().queue).toHaveLength(0);
  });

  it("dismiss ignores unknown ids", () => {
    addToast({ category: "information", message: "x" });
    useToastStore.getState().dismiss("nonexistent");
    expect(useToastStore.getState().queue).toHaveLength(1);
  });

  it("_clearAll empties the queue", () => {
    addToast({ category: "information", message: "a" });
    addToast({ category: "warning", message: "b" });
    useToastStore.getState()._clearAll();
    expect(useToastStore.getState().queue).toHaveLength(0);
  });

  it(`drops oldest when queue exceeds TOAST_QUEUE_MAX (${TOAST_QUEUE_MAX})`, () => {
    const messages = Array.from({ length: TOAST_QUEUE_MAX + 2 }, (_, i) => `msg-${i}`);
    messages.forEach((msg) => addToast({ category: "information", message: msg }));
    const { queue } = useToastStore.getState();
    expect(queue).toHaveLength(TOAST_QUEUE_MAX);
    // Oldest messages (msg-0, msg-1) should have been dropped
    expect(queue.map((t) => t.message)).not.toContain("msg-0");
    expect(queue.map((t) => t.message)).not.toContain("msg-1");
    // Newest should be present
    expect(queue.at(-1)?.message).toBe(`msg-${TOAST_QUEUE_MAX + 1}`);
  });

  it("each toast has a unique id", () => {
    addToast({ category: "information", message: "a" });
    addToast({ category: "information", message: "b" });
    const ids = useToastStore.getState().queue.map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ToastContainer component tests
// ---------------------------------------------------------------------------

describe("ToastContainer", () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders nothing when queue is empty", () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a toast with role=alert and correct message", () => {
    addToast({ category: "information", message: "Range walk complete." });
    render(<ToastContainer />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain("Range walk complete.");
  });

  it("sets data-category on the toast element", () => {
    addToast({ category: "warning", message: "Soft cap reached." });
    render(<ToastContainer />);
    const toast = screen.getByTestId("toast");
    expect(toast.getAttribute("data-category")).toBe("warning");
  });

  it("renders multiple toasts", () => {
    addToast({ category: "information", message: "first" });
    addToast({ category: "error", message: "second" });
    render(<ToastContainer />);
    const toasts = screen.getAllByRole("alert");
    expect(toasts).toHaveLength(2);
  });

  it("clicking dismiss button removes the toast", () => {
    addToast({ category: "success", message: "done" });
    render(<ToastContainer />);
    const btn = screen.getByRole("button", { name: /dismiss/i });
    fireEvent.click(btn);
    expect(useToastStore.getState().queue).toHaveLength(0);
  });

  it("auto-dismisses a transient toast after durationMs", () => {
    addToast({ category: "information", message: "auto", durationMs: 3000 });
    render(<ToastContainer />);
    expect(screen.getByRole("alert")).toBeDefined();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(useToastStore.getState().queue).toHaveLength(0);
  });

  it("does NOT auto-dismiss when durationMs is 0", () => {
    addToast({ category: "error", message: "persist", lifespan: "session", durationMs: 0 });
    render(<ToastContainer />);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(useToastStore.getState().queue).toHaveLength(1);
  });
});
