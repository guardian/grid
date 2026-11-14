/**
 * Context menu for column header interactions.
 *
 * Provides:
 * - "Resize column to fit data" (single column, only when a specific column
 *   header was right-clicked)
 * - "Resize all columns to fit data"
 * - Column visibility toggles (checkbox per column)
 *
 * The menu manages its own open/close state. The parent calls `open(x, y, columnId?)`
 * via the imperative handle to show the menu at a position. The menu closes on
 * outside click, scroll, or Escape, and auto-clamps to viewport bounds.
 *
 * Uses shared `popup-menu` / `popup-item` CSS classes from index.css.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Image } from "@/types/image";

export interface ColumnContextMenuHandle {
  open: (x: number, y: number, columnId?: string) => void;
}

interface ColumnContextMenuProps {
  /** All column definitions (visible + hidden). */
  columns: ColumnDef<Image, unknown>[];
  /** Extract stable ID from a column def. */
  getColumnId: (col: ColumnDef<Image, unknown>) => string;
  /** Which column IDs are currently hidden. */
  hiddenColumnIds: string[];
  /** Toggle a column's visibility. */
  onToggleVisibility: (columnId: string) => void;
  /** Resize a single column to its fitted width. */
  onResizeColumnToFit: (columnId: string) => void;
  /** Resize all visible columns to their fitted widths. */
  onResizeAllColumnsToFit: () => void;
}

export const ColumnContextMenu = forwardRef<
  ColumnContextMenuHandle,
  ColumnContextMenuProps
>(function ColumnContextMenu(
  {
    columns,
    getColumnId,
    hiddenColumnIds,
    onToggleVisibility,
    onResizeColumnToFit,
    onResizeAllColumnsToFit,
  },
  ref,
) {
  const [menuPos, setMenuPos] = useState<{
    x: number;
    y: number;
    columnId?: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Imperative handle — parent calls menuRef.current.open(x, y, colId)
  useImperativeHandle(ref, () => ({
    open: (x: number, y: number, columnId?: string) => {
      setMenuPos({ x, y, columnId });
    },
  }));

  // Close on outside click, scroll, or Escape. Clamp to viewport bounds.
  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    const handleMouseDown = (e: MouseEvent) => {
      // Don't close if the click is inside the menu (includes scrollbar area)
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const handleScroll = (e: Event) => {
      // Don't close when the menu itself scrolls (mousewheel or scrollbar drag).
      // Scroll events don't bubble — the target is always the element that scrolled.
      if (e.target === menuRef.current) return;
      close();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKeyDown);

    // Clamp menu position so it stays fully on-screen.
    // Also cap its height to the available viewport space so it scrolls
    // rather than being cut off at extreme zoom levels.
    requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      let { x, y } = menuPos;
      if (rect.right > window.innerWidth) x = window.innerWidth - rect.width - 4;
      if (rect.bottom > window.innerHeight) y = window.innerHeight - rect.height - 4;
      if (x < 0) x = 4;
      if (y < 0) y = 4;

      // Max height = viewport minus the final y position minus a small margin
      menu.style.maxHeight = `${window.innerHeight - y - 4}px`;

      if (x !== menuPos.x || y !== menuPos.y) {
        setMenuPos({ ...menuPos, x, y });
      }
    });

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuPos]);

  const handleResizeColumn = useCallback(
    (colId: string) => {
      onResizeColumnToFit(colId);
      setMenuPos(null);
    },
    [onResizeColumnToFit],
  );

  const handleResizeAll = useCallback(() => {
    onResizeAllColumnsToFit();
    setMenuPos(null);
  }, [onResizeAllColumnsToFit]);

  if (!menuPos) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Column options"
      className="fixed popup-menu overflow-y-auto"
      style={{ left: menuPos.x, top: menuPos.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Resize actions */}
      {menuPos.columnId && (
        <div
          role="menuitem"
          onClick={() => handleResizeColumn(menuPos.columnId!)}
          className="popup-item"
        >
          <span className="w-3" />
          Resize column to fit data
        </div>
      )}
      <div
        role="menuitem"
        onClick={handleResizeAll}
        className="popup-item"
      >
        <span className="w-3" />
        Resize all columns to fit data
      </div>

      {/* Separator */}
      <div role="separator" className="my-1 border-t border-grid-separator" />

      {/* Column visibility toggles */}
      {columns.map((col) => {
        const id = getColumnId(col);
        const label = typeof col.header === "string" ? col.header : id;
        const isVisible = !hiddenColumnIds.includes(id);
        return (
          <div
            key={id}
            role="menuitemcheckbox"
            aria-checked={isVisible}
            onClick={() => onToggleVisibility(id)}
            className="popup-item"
          >
            <span className="w-3 text-center text-grid-accent">
              {isVisible ? "✓" : ""}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );
});

