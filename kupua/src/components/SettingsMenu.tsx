/**
 * SettingsMenu — three-dot menu in the SearchBar (far right).
 *
 * Contains UI preferences like focus mode. Opens a dropdown on click,
 * closes on outside click or Escape.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useUiPrefsStore,
  useEffectiveFocusMode,
  type FocusMode,
} from "@/stores/ui-prefs-store";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const pointerCoarse = useUiPrefsStore((s) => s._pointerCoarse);
  const effectiveMode = useEffectiveFocusMode();
  const setFocusMode = useUiPrefsStore((s) => s.setFocusMode);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleModeChange = useCallback(
    (mode: FocusMode) => {
      setFocusMode(mode);
    },
    [setFocusMode],
  );

  return (
    <div className="relative shrink-0 -mr-3">
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-label="Settings"
        aria-expanded={open}
        aria-haspopup="menu"
        className="w-11 h-11 flex items-center justify-center hover:bg-grid-hover transition-colors text-grid-text-muted hover:text-grid-text"
        title="Settings"
      >
        {/* Material Design more_vert icon */}
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 bg-grid-bg border border-grid-border rounded shadow-lg z-50 py-1"
        >
          {/* Focus mode section */}
          <div className="px-3 py-1.5 text-xs font-medium text-grid-text-dim uppercase tracking-wider">
            Click mode
          </div>

          <button
            role="menuitemradio"
            aria-checked={effectiveMode === "explicit"}
            onClick={() => handleModeChange("explicit")}
            disabled={pointerCoarse}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
              pointerCoarse
                ? "text-grid-text-dim cursor-not-allowed"
                : effectiveMode === "explicit"
                  ? "text-grid-accent bg-grid-hover/20"
                  : "text-grid-text hover:bg-grid-hover/15"
            }`}
          >
            <span className="w-4 text-center">
              {effectiveMode === "explicit" ? "●" : "○"}
            </span>
            <span>
              Click to focus
              <span className="block text-xs text-grid-text-dim">
                Single-click highlights, double-click opens
              </span>
            </span>
          </button>

          <button
            role="menuitemradio"
            aria-checked={effectiveMode === "phantom"}
            onClick={() => handleModeChange("phantom")}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
              effectiveMode === "phantom"
                ? "text-grid-accent bg-grid-hover/20"
                : "text-grid-text hover:bg-grid-hover/15"
            }`}
          >
            <span className="w-4 text-center">
              {effectiveMode === "phantom" ? "●" : "○"}
            </span>
            <span>
              Click to open
              <span className="block text-xs text-grid-text-dim">
                Single-click opens image (like Kahuna)
                {pointerCoarse && " — always on for touch"}
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
