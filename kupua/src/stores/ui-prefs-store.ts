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
 * On devices with `pointer: coarse` (touch screens, no mouse), phantom mode
 * is forced regardless of the stored preference — explicit focus is
 * meaningless without a mouse and keyboard.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSearchStore } from "@/stores/search-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FocusMode = "explicit" | "phantom";

interface UiPrefsState {
  /** User's chosen focus mode (persisted in localStorage). */
  focusMode: FocusMode;

  /**
   * Whether the primary pointer is coarse (touch device).
   * NOT persisted — detected at runtime via matchMedia.
   * When true, effectiveFocusMode is always "phantom".
   */
  _pointerCoarse: boolean;

  /** Set the focus mode preference. Clears any existing explicit focus. */
  setFocusMode: (mode: FocusMode) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set) => ({
      focusMode: "explicit" as FocusMode,
      _pointerCoarse: false,
      setFocusMode: (mode) => {
        set({ focusMode: mode });
        // When switching to phantom, clear any existing explicit focus
        // so the ring disappears immediately and keyboard enters scroll mode.
        if (mode === "phantom") {
          useSearchStore.getState().setFocusedImageId(null);
        }
      },
    }),
    {
      name: "kupua-ui-prefs",
      // Only persist focusMode, not the runtime _pointerCoarse flag.
      partialize: (state) => ({ focusMode: state.focusMode }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Derived selector — the focus mode actually in effect
// ---------------------------------------------------------------------------

/**
 * Hook: returns the effective focus mode (coarse pointer forces phantom).
 * Components should use this, not `focusMode` directly.
 */
export function useEffectiveFocusMode(): FocusMode {
  return useUiPrefsStore((s) => s._pointerCoarse ? "phantom" : s.focusMode);
}

/**
 * Non-reactive getter for use in event handlers and callbacks.
 */
export function getEffectiveFocusMode(): FocusMode {
  const s = useUiPrefsStore.getState();
  return s._pointerCoarse ? "phantom" : s.focusMode;
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
