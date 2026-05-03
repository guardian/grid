/**
 * Tickbox — selection affordance for grid cells and table rows.
 *
 * Visibility is CSS-driven (not React state) so mode-enter/exit doesn't
 * trigger per-cell React reconciliation:
 *
 *   .tickbox { display: none }                    — hidden by default
 *   [data-grid-cell]:hover .tickbox              — shown on hover (fine pointer)
 *   [data-selection-mode="true"] .tickbox        — always shown in Selection Mode
 *
 * The `useIsSelected(imageId)` subscription inside this component ensures
 * only the cell for the toggled image re-renders; the rest stay stable.
 *
 * Usage in ImageGrid: absolute-positioned overlay (top-left of cell).
 * Usage in ImageTable: rendered in the fixed-width selection column cell.
 *
 * @param imageId   - The image this tickbox represents.
 * @param disabled  - True for skeleton cells (image not yet loaded). Renders null.
 * @param onTickClick - Forwarded click handler (parent builds interpretClick ctx).
 *                      Called BEFORE stopPropagation so the event is available
 *                      if the parent needs modifier keys.
 */

import { memo } from "react";
import { useIsSelected } from "@/hooks/useIsSelected";

interface TickboxProps {
  imageId: string;
  disabled?: boolean;
  onTickClick: (e: React.MouseEvent) => void;
}

export const Tickbox = memo(function Tickbox({
  imageId,
  disabled,
  onTickClick,
}: TickboxProps) {
  const isSelected = useIsSelected(imageId);

  if (disabled) return null;

  return (
    <button
      type="button"
      data-tickbox
      className="tickbox absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded flex items-center justify-center transition-colors"
      style={{
        backgroundColor: isSelected
          ? "rgba(0, 173, 238, 0.9)"
          : "rgba(0,0,0,0.5)",
        boxShadow: isSelected ? undefined : "inset 0 1px 3px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.35), 0 1px 0 rgba(255,255,255,0.08)",
      }}
      aria-checked={isSelected}
      aria-label={isSelected ? "Deselect image" : "Select image"}
      onClick={(e) => {
        e.stopPropagation();
        onTickClick(e);
      }}
    >
      {isSelected && (
        <svg
          className="w-3 h-3 text-white"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1.5 6L4.5 9L10.5 3"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
});

/**
 * Compact inline variant used in the table's selection column.
 * The tickbox is centred in a fixed-width cell; not absolute-positioned.
 */
export const TableTickbox = memo(function TableTickbox({
  imageId,
  disabled,
  onTickClick,
}: TickboxProps) {
  const isSelected = useIsSelected(imageId);

  if (disabled) return null;

  return (
    <button
      type="button"
      data-tickbox
      className="tickbox w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors"
      style={{
        backgroundColor: isSelected
          ? "rgba(0, 173, 238, 0.9)"
          : "rgba(255,255,255,0.12)",
        boxShadow: isSelected ? undefined : "inset 0 1px 3px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.35), 0 1px 0 rgba(255,255,255,0.08)",
      }}
      aria-checked={isSelected}
      aria-label={isSelected ? "Deselect image" : "Select image"}
      onClick={(e) => {
        e.stopPropagation();
        onTickClick(e);
      }}
    >
      {isSelected && (
        <svg
          className="w-2.5 h-2.5 text-white"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1.5 6L4.5 9L10.5 3"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
});
