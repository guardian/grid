/**
 * UI preferences store — persisted user settings that are NOT search state.
 *
 * Separate from search-store because these are UI concerns (focus interaction
 * model, future display preferences) that should not trigger search-related
 * subscriptions or couple to the search lifecycle.
 *
 * `focusMode` controls whether the user interacts via explicit focus (click
 * to highlight, double-click to open) or phantom focus (click to open
 * directly, no visible focus ring). See architecture doc §3.
 *
 * The compact phone model uses phantom mode without changing the stored
 * desktop preference.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useSearchStore } from "@/stores/search-store";
import { readHomeView } from "@/lib/home-view";
import { isCompactNow, useIsCompact } from "@/hooks/useShell";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FocusMode = "explicit" | "phantom";
export type Density = "grid" | "table" | "justified" | "form";
type DensityContext = "search" | "upload";

export const BROWSING_DENSITIES: Readonly<Record<"search" | "upload", readonly Density[]>> = {
  search: ["table", "grid", "justified"],
  upload: ["table", "grid", "justified", "form"],
};

export function availableDensity(context: "search" | "upload", preference: unknown): Density {
  return BROWSING_DENSITIES[context].includes(preference as Density) ? preference as Density : context === "upload" ? "form" : defaultDensity();
}

export const DENSITY_STORAGE_KEY = "kupua-density";

export function writeDensityPreference(density: Density, context: DensityContext = "search"): void {
  try { sessionStorage.setItem(context === "upload" ? "kupua-upload-density" : DENSITY_STORAGE_KEY, density); } catch {}
}

/** Locked Home view wins; else compact phones default to justified, desktop to grid. */
export function defaultDensity(): Density {
  const locked = readHomeView();
  if (locked) return locked.density;
  try {
    return isCompactNow() ? "justified" : "grid";
  } catch {
    return "grid";
  }
}

function initialDensity(context: DensityContext = "search"): Density {
  try {
    const saved = sessionStorage.getItem(context === "upload" ? "kupua-upload-density" : DENSITY_STORAGE_KEY);
    return availableDensity(context, saved);
  } catch {
    return availableDensity(context, undefined);
  }
}

interface UiPrefsState {
  density: Density;
  densityContext: DensityContext;
  setDensityContext: (context: DensityContext, preference?: Density) => void;
  _densityIntent: number;
  setDensity: (density: Density, context?: DensityContext) => void;
  /** User's chosen focus mode (persisted in localStorage). */
  focusMode: FocusMode;

  /** Whether to blur potentially graphic images (persisted in localStorage). Default on. */
  blurGraphicImages: boolean;

  /**
   * Whether the primary pointer is coarse (touch device).
   * NOT persisted — detected at runtime via matchMedia.
  * Input capability only; the selected shell owns focus policy.
   */
  _pointerCoarse: boolean;

  /** Set the focus mode preference. Clears any existing explicit focus. */
  setFocusMode: (mode: FocusMode) => void;

  /** Toggle the graphic-image blur preference. */
  toggleBlurGraphicImages: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set, get) => ({
      density: initialDensity(),
      densityContext: "search",
      setDensityContext: (context, preference) => {
        const density = availableDensity(context, preference ?? initialDensity(context));
        set(state => ({ densityContext: context, density,
          _densityIntent: state._densityIntent + (density !== state.density ? 1 : 0) }));
      },
      _densityIntent: 0,
      setDensity: (density, context = get().densityContext) => {
        density = availableDensity(context, density);
        writeDensityPreference(density, context);
        set((state) => ({ density, densityContext: context, _densityIntent: state._densityIntent + 1 }));
      },
      focusMode: "explicit" as FocusMode,
      blurGraphicImages: true,
      _pointerCoarse: false,
      setFocusMode: (mode) => {
        set({ focusMode: mode });
        // When switching to phantom, clear any existing explicit focus
        // so the ring disappears immediately and keyboard enters scroll mode.
        if (mode === "phantom") {
          useSearchStore.getState().setFocusedImageId(null);
        }
      },
      toggleBlurGraphicImages: () => set((s) => ({ blurGraphicImages: !s.blurGraphicImages })),
    }),
    {
      name: "kupua-ui-prefs",
      storage: createJSONStorage(() => ({
        getItem: (name) => { try { return localStorage.getItem(name); } catch { return null; } },
        setItem: (name, value) => { try { localStorage.setItem(name, value); } catch {} },
        removeItem: (name) => { try { localStorage.removeItem(name); } catch {} },
      })),
      // Only persist user-facing preferences, not the runtime _pointerCoarse flag.
      partialize: (state) => ({ focusMode: state.focusMode, blurGraphicImages: state.blurGraphicImages }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<Pick<UiPrefsState, "focusMode" | "blurGraphicImages">> | undefined;
        return { ...current, focusMode: saved?.focusMode ?? current.focusMode,
          blurGraphicImages: saved?.blurGraphicImages ?? current.blurGraphicImages };
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Derived selector — the focus mode actually in effect
// ---------------------------------------------------------------------------

/**
 * Hook: returns the effective focus mode (compact shell forces phantom).
 * Components should use this, not `focusMode` directly.
 */
export function useEffectiveFocusMode(): FocusMode {
  const compact = useIsCompact();
  const mode = useUiPrefsStore((s) => s.densityContext === "upload" ? "phantom" : s.focusMode);
  return compact ? "phantom" : mode;
}

/**
 * Non-reactive getter for use in event handlers and callbacks.
 */
export function getEffectiveFocusMode(): FocusMode {
  const s = useUiPrefsStore.getState();
  return s.densityContext === "upload" || isCompactNow() ? "phantom" : s.focusMode;
}

// ---------------------------------------------------------------------------
// matchMedia listener — detects pointer: coarse at runtime
// ---------------------------------------------------------------------------

if (typeof window !== "undefined") {
  const mql = window.matchMedia("(pointer: coarse)");
  // Set initial value
  useUiPrefsStore.setState({ _pointerCoarse: mql.matches });
  // React to changes (iPad detaching keyboard, Chrome DevTools toggle)
  mql.addEventListener("change", (e) => {
    useUiPrefsStore.setState({ _pointerCoarse: e.matches });
  });
}
