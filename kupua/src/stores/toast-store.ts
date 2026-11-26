/**
 * Toast store — ephemeral notification queue.
 *
 * No persistence. All toasts are cleared on page unload.
 *
 * Category strings match BBC's gr-notifications-banner vocabulary exactly so
 * that a future bridge (PR #4253 in the main grid repo) can map
 * `Notification.category → ToastCategory` without a type mismatch.
 * See exploration/docs/deviations.md for the alignment note.
 *
 * Lifespan strings also match BBC's vocabulary. In S2.5 only 'transient' is
 * used. 'session' / 'persistent' are included so that the type is stable when
 * S3b+ adds longer-lived toasts.
 *
 * `addToast` is exported as a standalone imperative function so that
 * non-React code (e.g. selection-store hydration in S3b) can fire toasts
 * without needing a hook.
 *
 * `window.__kupua_toast_store__` is exposed in development so you can fire
 * toasts from the browser console for manual testing.
 */

import { create } from "zustand";
import { TOAST_QUEUE_MAX, TOAST_DEFAULT_DURATION_MS } from "@/constants/tuning";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Matches BBC's `category` enum from gr-notifications-banner exactly.
 * 'announcement' is unused in S2.5 but included for vocabulary completeness.
 */
export type ToastCategory =
  | "information"
  | "warning"
  | "error"
  | "success"
  | "announcement";

/**
 * Matches BBC's `lifespan` enum from gr-notifications-banner exactly.
 * Only 'transient' is wired in S2.5.
 */
export type ToastLifespan = "transient" | "session" | "persistent";

export interface ToastItem {
  /** Auto-generated via crypto.randomUUID(). */
  id: string;
  category: ToastCategory;
  message: string;
  link?: { href: string; label: string };
  interaction?: "share";
  /** Default 'transient'. */
  lifespan: ToastLifespan;
  /**
   * Auto-dismiss after this many ms. Only applied to 'transient' toasts.
   * 0 = no auto-dismiss (used for 'session'/'persistent').
   */
  durationMs: number;
}

interface ToastState {
  /** Ordered oldest-first. ToastContainer renders newest-first. */
  queue: ToastItem[];
  add: (item: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
  _clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useToastStore = create<ToastState>()((set) => ({
  queue: [],

  add: (item) =>
    set((state) => {
      const toast: ToastItem = { ...item, id: crypto.randomUUID() };
      const next = [...state.queue.filter(queued => !toast.interaction || queued.interaction !== toast.interaction), toast];
      // Drop the oldest ordinary toasts when over capacity; Share has its own slot.
      const ordinary = next.filter(queued => queued.interaction !== "share");
      const evicted = new Set(ordinary.slice(0, Math.max(0, ordinary.length - TOAST_QUEUE_MAX)));
      return { queue: next.filter(queued => !evicted.has(queued)) };
    }),

  dismiss: (id) =>
    set((state) => ({ queue: state.queue.filter((t) => t.id !== id) })),

  _clearAll: () => set({ queue: [] }),
}));

// ---------------------------------------------------------------------------
// Imperative API (for non-React callers like selection-store)
// ---------------------------------------------------------------------------

/**
 * Fire a toast from anywhere — no hook required.
 *
 * @example
 * addToast({ category: 'warning', message: 'Selection limited to 5,000 items.' });
 */
export function addToast(
  item: Pick<ToastItem, "category" | "message"> &
    Partial<Pick<ToastItem, "lifespan" | "durationMs" | "link" | "interaction">>,
): void {
  useToastStore.getState().add({
    ...item,
    lifespan: item.lifespan ?? "transient",
    durationMs: item.durationMs ?? TOAST_DEFAULT_DURATION_MS,
  });
}

// ---------------------------------------------------------------------------
// Window accessor — for Playwright tests (mirrors selection-store pattern)
// ---------------------------------------------------------------------------

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__kupua_toast_store__ = {
    info: (msg: string) => addToast({ category: "information", message: msg }),
    warning: (msg: string) => addToast({ category: "warning", message: msg }),
    error: (msg: string) => addToast({ category: "error", message: msg }),
    success: (msg: string) => addToast({ category: "success", message: msg }),
    announcement: (msg: string) => addToast({ category: "announcement", message: msg }),
    /** Zustand store instance — for getState().queue.length in tests. */
    _store: useToastStore,
  };
}
