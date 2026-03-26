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
 * See kupua/exploration/docs/panels-plan.md for the full design.
 */

import {
  type ReactNode,
  useCallback,
  useRef,
} from "react";
import {
  usePanelStore,
  MIN_PANEL_WIDTH,
  MAX_PANEL_WIDTH_RATIO,
  type PanelSide,
} from "@/stores/panel-store";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PanelLayoutProps {
  /** Content for the left panel (e.g. FacetFilters). Rendered when left panel is visible. */
  leftPanel?: ReactNode;
  /** Content for the right panel (e.g. metadata). Rendered when right panel is visible. */
  rightPanel?: ReactNode;
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
    <div className={isOpen ? undefined : "border-b border-grid-separator"}>
      <button
        className="flex items-center gap-1 w-full px-1.5 py-2 text-sm font-medium text-grid-text hover:bg-grid-hover/15 transition-colors cursor-pointer select-none"
        onClick={() => toggleSection(sectionId)}
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
      </button>
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

// ---------------------------------------------------------------------------
// PanelLayout — main component
// ---------------------------------------------------------------------------

export function PanelLayout({ leftPanel, rightPanel, children }: PanelLayoutProps) {
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
            className="shrink-0 overflow-y-scroll bg-grid-panel border-r border-grid-separator"
            style={{ width: leftWidth, overflowAnchor: "none" }}
          >
            {leftPanel}
          </div>
          <ResizeHandle side="left" panelRef={leftPanelRef} />
        </>
      )}

      {/* Main content — fills remaining space */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {children}
      </div>

      {/* Right panel */}
      {rightVisible && rightPanel && (
        <>
          <ResizeHandle side="right" panelRef={rightPanelRef} />
          <div
            ref={rightPanelRef}
            className="shrink-0 overflow-y-scroll bg-grid-panel border-l border-grid-separator"
            style={{ width: rightWidth }}
          >
            {rightPanel}
          </div>
        </>
      )}
    </div>
  );
}






