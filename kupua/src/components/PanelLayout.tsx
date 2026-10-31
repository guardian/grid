/**
 * PanelLayout — flex row of [left-panel?] [main-content] [right-panel?].
 *
 * Manages panel visibility, resize handles, keyboard shortcuts (`[`/`]`,
 * or `Alt+[`/`Alt+]` when focus is in an editable field), and accordion
 * sections. Main content fills remaining space.
 *
 * Resize handles update width via CSS custom property during drag (no
 * React re-render per frame). On drag end, the final width is committed
 * to the panel store → localStorage. ImageGrid's ResizeObserver fires on
 * the main content container and handles scroll anchoring.
 *
 * See kupua/exploration/docs/zz Archive/panels-plan.md for the full design.
 */

import {
  type ReactNode,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  usePanelStore,
  MIN_PANEL_WIDTH,
  MAX_PANEL_WIDTH_RATIO,
  type PanelSide,
} from "@/stores/panel-store";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { useSelectionStore } from "@/stores/selection-store";
import { BottomSheet } from "./BottomSheet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PanelLayoutProps {
  /** Content for the left panel (e.g. FacetFilters). Rendered when left panel is visible. */
  leftPanel?: ReactNode;
  /** Content for the right panel (e.g. metadata). Rendered when right panel is visible. */
  rightPanel?: ReactNode;
  /** Optional scrubber element rendered on the right edge of the content area. */
  scrubber?: ReactNode;
  /** Main content (grid or table). Always rendered. */
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Accordion Section — reusable collapsible section within a panel
// ---------------------------------------------------------------------------

interface AccordionSectionProps {
  sectionId: string;
  title: string;
  /** Optional content rendered on the right side of the header (e.g. timing). */
  headerRight?: ReactNode;
  children: ReactNode;
}

export function AccordionSection({ sectionId, title, headerRight, children }: AccordionSectionProps) {
  const isOpen = usePanelStore((s) => s.isSectionOpen(sectionId));
  const toggleSection = usePanelStore((s) => s.toggleSection);

  return (
    <div>
      {/* Not a <button> — headerRight (e.g. AggCircuitBreaker) can render its
          own <button>, and <button> cannot contain a nested <button> (invalid
          HTML, React hydration warning). role="button" + explicit keyboard
          handling keeps it accessible. */}
      <div
        role="button"
        tabIndex={0}
        className="flex items-center gap-1 w-full px-1.5 h-9 border-b border-grid-separator text-sm font-medium text-grid-text hover:bg-grid-hover/15 transition-colors cursor-pointer select-none"
        onClick={() => toggleSection(sectionId)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleSection(sectionId);
          }
        }}
        aria-expanded={isOpen}
        aria-controls={`section-${sectionId}`}
      >
        {/* Material chevron_right (collapsed) / expand_more (expanded) */}
        <svg
          className="w-5 h-5 shrink-0 text-grid-text-dim"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          {isOpen
            ? <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" /> /* expand_more */
            : <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /> /* chevron_right */
          }
        </svg>
        {title}
        {/* Right-side content (e.g. timing) — click doesn't toggle, stop propagation */}
        {headerRight && (
          <span className="flex-1" />
        )}
        {headerRight && (
          <span
            className="text-2xs text-grid-text-dim"
            onClick={(e) => e.stopPropagation()}
          >
            {headerRight}
          </span>
        )}
      </div>
      {isOpen && (
        <div id={`section-${sectionId}`}>
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resize Handle — draggable divider between panel and main content
// ---------------------------------------------------------------------------

interface ResizeHandleProps {
  side: PanelSide;
  panelRef: React.RefObject<HTMLDivElement | null>;
}

function ResizeHandle({ side, panelRef }: ResizeHandleProps) {
  const setWidth = usePanelStore((s) => s.setWidth);
  const togglePanel = usePanelStore((s) => s.togglePanel);

  const handleDoubleClick = useCallback(() => {
    togglePanel(side);
  }, [togglePanel, side]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const panel = panelRef.current;
      if (!panel) return;

      const startX = e.clientX;
      const startWidth = panel.offsetWidth;
      const maxWidth = window.innerWidth * MAX_PANEL_WIDTH_RATIO;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = side === "left"
          ? moveEvent.clientX - startX
          : startX - moveEvent.clientX;
        const newWidth = Math.min(maxWidth, Math.max(MIN_PANEL_WIDTH, startWidth + delta));
        // CSS-only during drag — no React re-render per frame
        panel.style.width = `${newWidth}px`;
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Commit final width to store
        const finalWidth = panel.offsetWidth;
        setWidth(side, finalWidth);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [side, panelRef, setWidth],
  );

  return (
    <div
      className="shrink-0 w-1 hover:bg-grid-accent/30 active:bg-grid-accent/50 cursor-col-resize transition-colors"
      style={{ touchAction: "none" }}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} panel (double-click to close)`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    />
  );
}

import { useIsCompact } from "@/hooks/useShell";
export { useIsCompact };

/** Compact-shell side sheet: slides in, swipe toward its edge to dismiss. */
function SideSheet({ side, onDismiss, children }: { side: PanelSide; onDismiss: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; t: number; locked: boolean | null } | null>(null);
  const sign = side === "left" ? -1 : 1;

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    // The slide-in animation's fill would override inline translate.
    if (ref.current) ref.current.style.animation = "none";
    gesture.current = { x: t.clientX, y: t.clientY, t: performance.now(), locked: null };
  };
  const onTouchMove = (e: TouchEvent) => {
    const g = gesture.current;
    const el = ref.current;
    if (!g || !el) return;
    const dx = e.touches[0].clientX - g.x;
    const dy = e.touches[0].clientY - g.y;
    if (g.locked === null) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      g.locked = Math.abs(dx) > Math.abs(dy);
    }
    if (!g.locked) return;
    const offset = Math.max(0, dx * sign);
    el.style.transition = "none";
    el.style.translate = `${offset * sign}px 0`;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const g = gesture.current;
    const el = ref.current;
    gesture.current = null;
    if (!g?.locked || !el) return;
    const offset = Math.max(0, (e.changedTouches[0].clientX - g.x) * sign);
    const velocity = offset / Math.max(1, performance.now() - g.t);
    el.style.transition = "translate 0.2s cubic-bezier(0.22, 1, 0.36, 1)";
    if (offset > el.offsetWidth / 3 || velocity > 0.5) {
      el.style.translate = `${sign * 100}% 0`;
      el.addEventListener("transitionend", onDismiss, { once: true });
    } else {
      el.style.translate = "0 0";
    }
  };

  return (
    <div
      ref={ref}
      className={`absolute inset-y-0 z-50 overflow-y-auto bg-grid-bg shadow-xl ${
        side === "left" ? "left-0 border-r anim-sheet-left" : "right-0 border-l anim-sheet-right"
      } border-grid-separator`}
      style={{ width: "min(85vw, 360px)", overflowAnchor: "none", touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelLayout — main component
// ---------------------------------------------------------------------------

export function PanelLayout({ leftPanel, rightPanel, scrubber, children }: PanelLayoutProps) {
  const leftVisible = usePanelStore((s) => s.config.left.visible);
  const leftWidth = usePanelStore((s) => s.config.left.width);
  const rightVisible = usePanelStore((s) => s.config.right.visible);
  const rightWidth = usePanelStore((s) => s.config.right.width);
  const togglePanel = usePanelStore((s) => s.togglePanel);

  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts: [ = toggle left, ] = toggle right
  // Alt+[ / Alt+] when focus is in an editable field (search box etc.)
  // See lib/keyboard-shortcuts.ts for the universal pattern.
  // -------------------------------------------------------------------------

  useKeyboardShortcut("[", () => togglePanel("left"));
  useKeyboardShortcut("]", () => togglePanel("right"));

  const isCompact = useIsCompact();
  const hasSelection = useSelectionStore((s) => s.selectedIds.size > 0);

  // Compact: the expanded card belongs to the selection; clearing it (×, Home) closes it.
  // Transition-only, so resizing across the breakpoint never rewrites the saved panel config.
  const hadSelection = useRef(hasSelection);
  useEffect(() => {
    if (isCompact && hadSelection.current && !hasSelection && usePanelStore.getState().config.right.visible) {
      togglePanel("right");
    }
    hadSelection.current = hasSelection;
  }, [isCompact, hasSelection, togglePanel]);

  // Compact shell: panels overlay the results (viewport width unchanged) and a
  // scrim tap dismisses them.
  if (isCompact) {
    const showLeft = leftVisible && !!leftPanel;
    const showCard = !!rightPanel && hasSelection;
    return (
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Placeholder keeps the main content at the same child index as the desktop
            tree, so crossing the breakpoint doesn't remount the results (and lose scroll). */}
        {null}
        <div className="flex-1 min-w-0 flex relative">
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {children}
          </div>
          {scrubber}
        </div>
        {showLeft && (
          <div
            className="absolute inset-0 z-40 bg-black/50 anim-scrim"
            data-testid="panel-scrim"
            aria-hidden="true"
            onClick={() => togglePanel("left")}
          />
        )}
        {showLeft && (
          <SideSheet side="left" onDismiss={() => togglePanel("left")}>
            {leftPanel}
          </SideSheet>
        )}
        {showCard && (
          <BottomSheet
            label="Details"
            header="Selection details"
            expanded={rightVisible}
            onExpandedChange={(next) => { if (next !== rightVisible) togglePanel("right"); }}
          >
            {rightPanel}
          </BottomSheet>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Left panel */}
      {leftVisible && leftPanel && (
        <>
          <div
            ref={leftPanelRef}
            className="shrink-0 overflow-y-auto bg-grid-bg border-r border-grid-separator"
            style={{ width: leftWidth, overflowAnchor: "none" }}
          >
            {leftPanel}
          </div>
          <ResizeHandle side="left" panelRef={leftPanelRef} />
        </>
      )}

      {/* Main content — fills remaining space. Scrubber sits on the right edge.
          No overflow-hidden on the flex parent — the scrubber's tick labels
          extend leftward on hover and must not be clipped. Content overflow
          is contained by the inner flex-col child. */}
      <div className="flex-1 min-w-0 flex relative">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {children}
        </div>
        {scrubber}
      </div>

      {/* Right panel */}
      {rightVisible && rightPanel && (
        <>
          <ResizeHandle side="right" panelRef={rightPanelRef} />
          <div
            ref={rightPanelRef}
            className="shrink-0 overflow-y-auto bg-grid-bg border-l border-grid-separator"
            style={{ width: rightWidth }}
          >
            {rightPanel}
          </div>
        </>
      )}
    </div>
  );
}






