/**
 * Panel configuration store.
 *
 * Persists panel visibility, widths, and accordion section open/closed
 * state in localStorage. Not in the URL — this is client-specific preference.
 *
 * Two panel zones: left (filters + collections) and right (metadata).
 * Each has two states only: visible or hidden. No overlay, no lock.
 *
 * See kupua/exploration/docs/zz Archive/panels-plan.md for the full design.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PanelSide = "left" | "right";

interface PanelZone {
  visible: boolean;
  width: number;
}

interface PanelConfig {
  left: PanelZone;
  right: PanelZone;
  /**
   * Per-section open/closed state, keyed by section ID.
   * e.g. { "left-filters": true, "left-collections": false }
   * Missing keys default to the section's default open state.
   */
  sections: Record<string, boolean>;
}

interface PanelStore {
  config: PanelConfig;
  togglePanel: (side: PanelSide) => void;
  setWidth: (side: PanelSide, width: number) => void;
  toggleSection: (sectionId: string) => void;
  isSectionOpen: (sectionId: string) => boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default panel widths in pixels. */
const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 320;

/** Minimum / maximum panel widths in pixels. */
export const MIN_PANEL_WIDTH = 200;
export const MAX_PANEL_WIDTH_RATIO = 0.5; // max 50% of viewport

/**
 * Default open state for known sections.
 * Sections not listed here default to closed.
 */
const SECTION_DEFAULTS: Record<string, boolean> = {
  "left-filters": false, // Collapsed by default — see Decision #13
  "left-collections": true, // Expanded by default (familiar from kahuna)
  "right-metadata": true, // Expanded by default
};

const DEFAULT_CONFIG: PanelConfig = {
  left: { visible: false, width: DEFAULT_LEFT_WIDTH },
  right: { visible: false, width: DEFAULT_RIGHT_WIDTH },
  sections: {},
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePanelStore = create<PanelStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,

      togglePanel: (side) =>
        set((state) => ({
          config: {
            ...state.config,
            [side]: {
              ...state.config[side],
              visible: !state.config[side].visible,
            },
          },
        })),

      setWidth: (side, width) =>
        set((state) => ({
          config: {
            ...state.config,
            [side]: {
              ...state.config[side],
              width: Math.max(MIN_PANEL_WIDTH, width),
            },
          },
        })),

      toggleSection: (sectionId) =>
        set((state) => {
          const current = get().isSectionOpen(sectionId);
          return {
            config: {
              ...state.config,
              sections: {
                ...state.config.sections,
                [sectionId]: !current,
              },
            },
          };
        }),

      isSectionOpen: (sectionId) => {
        const explicit = get().config.sections[sectionId];
        if (explicit !== undefined) return explicit;
        return SECTION_DEFAULTS[sectionId] ?? false;
      },
    }),
    {
      name: "kupua-panel-config",
      merge: (persisted, current) => {
        const p = persisted as { config?: Partial<PanelConfig> } | undefined;
        return {
          ...current,
          config: {
            left: {
              ...current.config.left,
              ...(p?.config?.left ?? {}),
            },
            right: {
              ...current.config.right,
              ...(p?.config?.right ?? {}),
            },
            sections: {
              ...current.config.sections,
              ...(p?.config?.sections ?? {}),
            },
          },
        };
      },
    },
  ),
);

