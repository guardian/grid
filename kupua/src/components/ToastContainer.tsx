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
 * The bottom-right stack displays its newest toast at the top.
 *
 * Accessibility: each toast has role="alert" so screen readers announce it
 * immediately. The dismiss button has aria-label.
 */

import { Component, createRef, useEffect, useRef, type MouseEventHandler, type ReactNode } from "react";
import { useToastStore } from "@/stores/toast-store";
import type { ToastItem, ToastCategory } from "@/stores/toast-store";
import { registerShortcut } from "@/lib/keyboard-shortcuts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryClasses(category: ToastCategory): string {
  switch (category) {
    case "information":
      return "border-grid-accent bg-[#0e3555]/74";
    case "warning":
      return "border-grid-warning bg-[#563107]/74";
    case "error":
      return "border-grid-error bg-[#631a26]/74";
    case "success":
      return "border-grid-success bg-[#0b432a]/74";
    case "announcement":
      return "border-grid-accent-dark bg-[#202f58]/74";
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

  const message = toast.link ? <><span>{toast.message}</span>{" "}<a
    className="underline underline-offset-2" href={toast.link.href} target="_blank" rel="noopener noreferrer"
    onClick={toast.interaction === "share" ? () => dismiss(toast.id) : undefined}
    onAuxClick={event => { if (event.button === 1 && toast.interaction === "share") dismiss(toast.id); }}
  >{toast.link.label}</a></> : toast.message;
  return <ToastNotice category={toast.category} message={message} onDismiss={() => dismiss(toast.id)} animate={false} />;
}

export function ToastNotice({ category, message, icon, onDismiss, animate = true, className = "max-w-sm w-full" }: {
  category: ToastCategory;
  message: ReactNode;
  icon?: ReactNode;
  onDismiss: MouseEventHandler<HTMLButtonElement>;
  animate?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="toast"
      data-category={category}
      className={[
        "flex items-start gap-2 px-3 py-2.5 rounded border",
        "text-xs font-semibold text-grid-text-bright shadow-lg backdrop-blur-[6px] backdrop-saturate-[175%]",
        animate && "motion-safe:animate-[kupua-toast-in_0.2s_ease-out]",
        categoryClasses(category),
        className,
      ].filter(Boolean).join(" ")}
    >
      {/* Icon */}
      {icon ?? <CategoryIcon category={category} />}

      {/* Message */}
      <span className="flex-1 min-w-0 leading-snug">{message}</span>

      {/* Dismiss */}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="shrink-0 ml-1 opacity-60 hover:opacity-100 transition-opacity leading-none pointer-events-auto"
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

  const share = queue.find(toast => toast.interaction === "share");
  useEffect(() => {
    if (!share) return;
    const clickAway = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-share-trigger]:not(:disabled):not([aria-disabled='true'])")) return;
      if (event.target.closest<HTMLElement>("[data-toast-id]")?.dataset.toastId !== share.id) dismiss(share.id);
    };
    document.addEventListener("click", clickAway, true);
    return () => document.removeEventListener("click", clickAway, true);
  }, [share, dismiss]);

  return <ToastStack queue={queue} />;
}

type StackSnapshot = {
  positions: Map<string, number>;
  exit?: { node: HTMLElement; bounds: DOMRect; opacity: string };
};

class ToastStack extends Component<{ queue: ToastItem[] }, object, StackSnapshot | null> {
  private readonly stack = createRef<HTMLDivElement>();
  private readonly exits = new Set<HTMLElement>();

  private elements() {
    return Array.from(this.stack.current?.querySelectorAll<HTMLElement>("[data-toast-id]") ?? []);
  }

  getSnapshotBeforeUpdate(previous: Readonly<{ queue: ToastItem[] }>): StackSnapshot | null {
    if (typeof Element.prototype.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
    const oldShare = previous.queue.find(toast => toast.interaction === "share");
    const newShare = this.props.queue.find(toast => toast.interaction === "share");
    const elements = this.elements();
    const outgoing = oldShare && newShare && oldShare.id !== newShare.id
      ? elements.find(element => element.dataset.toastId === oldShare.id) : undefined;
    return {
      positions: new Map(elements.map(element => [element.dataset.toastId!, element.getBoundingClientRect().top])),
      exit: outgoing && { node: outgoing.cloneNode(true) as HTMLElement, bounds: outgoing.getBoundingClientRect(), opacity: getComputedStyle(outgoing).opacity },
    };
  }

  componentDidUpdate(previous: Readonly<{ queue: ToastItem[] }>, _state: object, snapshot: StackSnapshot | null) {
    const newest = this.props.queue.at(-1);
    if (newest && this.stack.current && !previous.queue.some(toast => toast.id === newest.id)) this.stack.current.scrollTop = 0;
    if (!snapshot) return;
    const duration = 190;
    for (const element of this.elements()) {
      const previousTop = snapshot.positions.get(element.dataset.toastId!);
      element.getAnimations().filter(animation => animation.id === "toast-position").forEach(animation => animation.cancel());
      if (previousTop === undefined) {
        const entrance = { duration, easing: "ease-out", delay: snapshot.exit ? 105 : 0, fill: "backwards" as const };
        element.animate([{ opacity: 0 }, { opacity: 1 }], entrance);
        element.animate([{ translate: "0 -8px" }, { translate: "0 0" }], { ...entrance, id: "toast-position" });
      } else {
        const delta = previousTop - element.getBoundingClientRect().top;
        if (delta) element.animate([{ translate: `0 ${delta}px` }, { translate: "0 0" }], { duration, easing: "ease-out", id: "toast-position" });
      }
    }
    if (!snapshot.exit) return;
    const { node, bounds, opacity } = snapshot.exit;
    node.removeAttribute("data-toast-id");
    node.querySelector("[data-testid]")?.removeAttribute("data-testid");
    node.setAttribute("aria-hidden", "true");
    node.inert = true;
    Object.assign(node.style, { position: "fixed", zIndex: "50", pointerEvents: "none", left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px` });
    document.body.append(node);
    this.exits.add(node);
    const remove = () => { node.remove(); this.exits.delete(node); };
    void node.animate([{ opacity, translate: "0 0" }, { opacity: 0, translate: "0 10px" }],
      { duration: 125, easing: "ease-out", fill: "forwards" }).finished.then(remove, remove);
  }

  componentWillUnmount() {
    this.exits.forEach(node => node.remove());
    this.exits.clear();
  }

  render() {
    if (this.props.queue.length === 0) return null;
    return <div ref={this.stack} aria-label="Notifications" className="fixed bottom-4 right-4 z-50 flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto [overflow-anchor:none] pointer-events-none">
      {[...this.props.queue].reverse().map(toast => <div key={toast.id} data-toast-id={toast.id} className="shrink-0 pointer-events-auto">
        <Toast toast={toast} />
      </div>)}
    </div>;
  }
}
