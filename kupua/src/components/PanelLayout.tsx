/**
 * PanelLayout — flex row of [left-panel?] [main-content] [right-panel?].
 *
 * Manages panel visibility, resize handles, keyboard shortcuts (`[`/`]`),
 * and accordion sections. Main content fills remaining space.
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
  useEffect,
  useRef,
} from "react";
import {
  usePanelStore,
  MIN_PANEL_WIDTH,
  MAX_PANEL_WIDTH_RATIO,
  type PanelSide,
} from "@/stores/panel-store";

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
  children: ReactNode;
}

export function AccordionSection({ sectionId, title, children }: AccordionSectionProps) {
  const isOpen = usePanelStore((s) => s.isSectionOpen(sectionId));
  const toggleSection = usePanelStore((s) => s.toggleSection);

  return (
    <div className="border-b border-grid-separator last:border-b-0">
      <button
        className="flex items-center gap-1.5 w-full px-3 py-2 text-sm font-medium text-grid-text hover:bg-grid-hover/15 transition-colors cursor-pointer select-none"
        onClick={() => toggleSection(sectionId)}
        aria-expanded={isOpen}
        aria-controls={`section-${sectionId}`}
      >
        <span
          className="text-[10px] text-grid-text-dim transition-transform"
          style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        >
          ▶
        </span>
        {title}
      </button>
      {isOpen && (
        <div id={`section-${sectionId}`} className="px-3 pb-3">
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
      onMouseDown={handleMouseDown}
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
  // Capture phase on document, skip when editable field is focused.
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when typing in an editable field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      // Skip when inside shadow DOM (CQL input)
      if ((e.target as HTMLElement)?.shadowRoot != null) return;
      // The CQL input's shadow root dispatches events with the cql-input
      // host as e.target (composed path). Check if target is inside one.
      const composed = e.composedPath?.();
      if (composed?.some((el) => (el as HTMLElement)?.tagName === "CQL-INPUT")) return;

      if (e.key === "[") {
        e.preventDefault();
        togglePanel("left");
      } else if (e.key === "]") {
        e.preventDefault();
        togglePanel("right");
      }
    };

    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [togglePanel]);

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
            className="shrink-0 overflow-y-auto bg-grid-panel border-r border-grid-separator"
            style={{ width: leftWidth }}
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
            className="shrink-0 overflow-y-auto bg-grid-panel border-l border-grid-separator"
            style={{ width: rightWidth }}
          >
            {rightPanel}
          </div>
        </>
      )}
    </div>
  );
}






