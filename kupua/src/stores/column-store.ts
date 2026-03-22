/**
 * Column configuration store.
 *
 * Persists column visibility and widths in localStorage.
 * Not in the URL — this is client-specific preference.
 *
 * Column IDs use TanStack Table's format: dot-path accessors have dots
 * replaced with underscores (e.g. "metadata.credit" → "metadata_credit").
 * Columns with an explicit `id` (e.g. "width") keep it as-is.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { gridConfig } from "@/lib/grid-config";

export interface ColumnConfig {
  /** Set of hidden column IDs (TanStack format, e.g. "source_mimeType") */
  hidden: string[];
  /** Persisted column widths (column ID → pixel width) */
  widths: Record<string, number>;
  /**
   * Widths before the most recent double-click auto-fit, per column.
   * Used to restore the previous width on a second double-click.
   * NOT persisted — only meaningful within the current session.
   */
  preDoubleClickWidths: Record<string, number>;
}

interface ColumnStore {
  config: ColumnConfig;
  toggleVisibility: (id: string) => void;
  /** Update one or more column widths (merge into existing). */
  setWidths: (widths: Record<string, number>) => void;
  /** Store pre-fit widths so a second double-click can restore them. */
  setPreDoubleClickWidths: (widths: Record<string, number>) => void;
  /** Clear pre-fit width for a column (e.g. after restoring). */
  clearPreDoubleClickWidth: (id: string) => void;
}

/** Alias column IDs — hidden by default. */
const aliasHiddenColumns = gridConfig.fieldAliases
  .filter((a) => a.displayInAdditionalMetadata)
  .map((a) => `alias_${a.alias}`);

const DEFAULT_CONFIG: ColumnConfig = {
  hidden: [
    "lastModified", "width", "height", "source_mimeType",
    "metadata_suppliersReference", "metadata_bylineTitle",
    ...aliasHiddenColumns,
  ],
  widths: {},
  preDoubleClickWidths: {},
};

export const useColumnStore = create<ColumnStore>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,

      toggleVisibility: (id) =>
        set((state) => {
          const hidden = state.config.hidden.includes(id)
            ? state.config.hidden.filter((h) => h !== id)
            : [...state.config.hidden, id];
          return { config: { ...state.config, hidden } };
        }),


      setWidths: (widths) =>
        set((state) => ({
          config: {
            ...state.config,
            widths: { ...state.config.widths, ...widths },
          },
        })),

      setPreDoubleClickWidths: (widths) =>
        set((state) => ({
          config: {
            ...state.config,
            preDoubleClickWidths: {
              ...state.config.preDoubleClickWidths,
              ...widths,
            },
          },
        })),

      clearPreDoubleClickWidth: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.config.preDoubleClickWidths;
          return { config: { ...state.config, preDoubleClickWidths: rest } };
        }),
    }),
    {
      name: "kupua-column-config",
      partialize: (state) => ({
        config: {
          hidden: state.config.hidden,
          widths: state.config.widths,
          // preDoubleClickWidths intentionally excluded from persistence
        },
      }),
      merge: (persisted, current) => {
        const p = persisted as { config?: Partial<ColumnConfig> } | undefined;
        return {
          ...current,
          config: {
            ...current.config,
            hidden: p?.config?.hidden ?? current.config.hidden,
            widths: p?.config?.widths ?? current.config.widths,
            // Always start with empty pre-double-click widths on load
            preDoubleClickWidths: {},
          },
        };
      },
    }
  )
);

