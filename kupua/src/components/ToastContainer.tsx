/**
 * ToastContainer — fixed bottom-right overlay that renders the toast queue.
 *
 * Mount once in the root layout. Auto-dismisses 'transient' toasts after
 * `durationMs`. Each toast has a manual dismiss button.
 *
 * Visual language:
 *   information → grid-accent (blue)
 *   warning     → grid-warning (amber)
 *   error       → grid-error (red)
 *   success     → grid-success (green)
 *   announcement → grid-accent-dark (dark blue — rare in S2.5)
 *
 * New toasts appear at the bottom of the stack (closest to the anchor corner);
 * they push older toasts upward. This matches standard toast UX convention.
 *
 * Accessibility: each toast has role="alert" so screen readers announce it
 * immediately. The dismiss button has aria-label.
 */

import { useEffect, useRef } from "react";
import { useToastStore } from "@/stores/toast-store";
import type { ToastItem, ToastCategory } from "@/stores/toast-store";
import { registerShortcut } from "@/lib/keyboard-shortcuts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryClasses(category: ToastCategory): string {
  switch (category) {
    case "information":
      return "border-grid-accent text-grid-text-bright bg-grid-accent/35 backdrop-blur-[1px]";
    case "warning":
      return "border-grid-warning text-grid-text-bright bg-grid-warning/35 backdrop-blur-[1px]";
    case "error":
      return "border-grid-error text-grid-text-bright bg-grid-error/35 backdrop-blur-[1px]";
    case "success":
      return "border-grid-success text-grid-text-bright bg-grid-success/35 backdrop-blur-[1px]";
    case "announcement":
      return "border-grid-accent-dark text-grid-text-bright bg-grid-accent-dark/35 backdrop-blur-[1px]";
  }
}

/** Material icon paths — inline SVG, fill="currentColor", same pattern as StatusBar. */
function CategoryIcon({ category }: { category: ToastCategory }) {
  // Paths from Material Design Icons (24×24 filled)
  let path: string;
  switch (category) {
    case "information":
      // info
      path = "M11 7h2v2h-2zm0 4h2v6h-2zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z";
      break;
    case "warning":
      // warning
      path = "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z";
      break;
    case "error":
      // error
      path = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z";
      break;
    case "success":
      // check_circle
      path = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z";
      break;
    case "announcement":
      // campaign
      path = "M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.39.4.53.8 1.07 1.2 1.61.96-.72 2.21-1.66 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z";
      break;
  }
  return (
    <svg
      className="w-4 h-4 shrink-0 mt-px"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Single toast item
// ---------------------------------------------------------------------------

function Toast({ toast }: { toast: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (toast.lifespan === "transient" && toast.durationMs > 0) {
      timerRef.current = setTimeout(() => dismiss(toast.id), toast.durationMs);
    }
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [toast.id, toast.lifespan, toast.durationMs, dismiss]);

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="toast"
      data-category={toast.category}
      className={[
        "flex items-start gap-2 px-3 py-2.5 rounded border",
        "text-xs shadow-lg max-w-sm w-full",
        "animate-[kupua-toast-in_0.2s_ease-out]",
        categoryClasses(toast.category),
      ].join(" ")}
    >
      {/* Icon */}
      <CategoryIcon category={toast.category} />

      {/* Message */}
      <span className="flex-1 leading-snug">{toast.message}</span>

      {/* Dismiss */}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(toast.id)}
        className="shrink-0 ml-1 opacity-60 hover:opacity-100 transition-opacity leading-none"
      >
        ✕
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

export function ToastContainer() {
  const queue = useToastStore((s) => s.queue);
  const dismiss = useToastStore((s) => s.dismiss);

  // Register Escape to dismiss the newest toast — but ONLY while toasts are
  // visible. When the queue is empty the handler is not in the registry and
  // cannot interfere with other Escape consumers (e.g. future modals).
  useEffect(() => {
    if (queue.length === 0) return;
    const newest = queue[queue.length - 1];
    return registerShortcut({
      key: "Escape",
      action: () => dismiss(newest.id),
    });
  }, [queue, dismiss]);

  if (queue.length === 0) return null;

  // Render newest-first so the freshest toast is closest to the anchor corner
  const reversed = [...queue].reverse();

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none"
    >
      {reversed.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} />
        </div>
      ))}
    </div>
  );
}
