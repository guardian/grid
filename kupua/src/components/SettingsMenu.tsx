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
import { isHostedBuild, KAHUNA_RETURN_PATH } from "@/lib/hosted-config";
import { useZoomStore } from "@/stores/zoom-store";
import { isAppFullscreen, toggleAppFullscreen } from "@/lib/app-fullscreen";
import { FULLSCREEN_EXIT_ICON, FULLSCREEN_ICON } from "@/components/NavStrip";
import { readHomeView, writeHomeView, type HomeView } from "@/lib/home-view";

// Browser-native shortcut: same result, and Esc/image fullscreen behave better in that mode.
const NATIVE_FULLSCREEN_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌃⌘F" : "F11";

function ZoomRow({ onFullscreen }: { onFullscreen: () => void }) {
  const density = useUiPrefsStore((s) => s.density);
  const offset = useZoomStore((s) =>
    density === "justified" ? s.justifiedOffset : density === "grid" ? s.gridOffset : 0,
  );
  const range = useZoomStore((s) => (density === "table" ? null : s.ranges[density]));
  const { step, reset } = useZoomStore.getState();
  const fullscreen = isAppFullscreen();
  const btn =
    "w-8 h-8 flex items-center justify-center rounded text-lg text-grid-text hover:bg-grid-hover/30 disabled:text-grid-text-dim disabled:hover:bg-transparent";
  return (
    <>
      <div className="px-3 py-1 flex items-center gap-1 text-sm text-grid-text">
        <span className="flex-1">{range ? "Zoom" : "View"}</span>
        {range && density !== "table" && (
          <>
            <button className={btn} aria-label="Smaller thumbnails" title="Smaller (−)" disabled={offset <= range[0]} onClick={() => step(density, -1)}>−</button>
            <button className="min-w-14 h-8 px-1 rounded text-xs tabular-nums hover:bg-grid-hover/30" title="Reset (0)" onClick={() => reset(density)}>
              {offset === 0 ? "Default" : offset > 0 ? `+${offset}` : `−${-offset}`}
            </button>
            <button className={btn} aria-label="Bigger thumbnails" title="Bigger (+)" disabled={offset >= range[1]} onClick={() => step(density, 1)}>+</button>
            <div className="w-px h-5 mx-1 bg-grid-separator" />
          </>
        )}
        <button
          className={btn}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          title={`${fullscreen ? "Exit full screen" : "Full screen"} (${NATIVE_FULLSCREEN_KEY})`}
          onClick={onFullscreen}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={fullscreen ? FULLSCREEN_EXIT_ICON : FULLSCREEN_ICON} />
          </svg>
        </button>
      </div>
      <LockViewRow />
      <div className="my-1 border-t border-grid-border" />
    </>
  );
}

function LockViewRow() {
  const density = useUiPrefsStore((s) => s.density);
  const justifiedOffset = useZoomStore((s) => s.justifiedOffset);
  const gridOffset = useZoomStore((s) => s.gridOffset);
  const [home, setHome] = useState(readHomeView);
  const current = { density, justifiedOffset, gridOffset };
  const matches = home !== null && home.density === density
    && (density === "table" || current[`${density}Offset`] === home[`${density}Offset`]);
  const save = (view: HomeView | null) => { writeHomeView(view); setHome(view); };
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={matches}
      onClick={() => save(matches ? null : current)}
      className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 text-grid-text hover:bg-grid-hover/15"
    >
      <span className="w-4 text-center">{matches ? "✓" : ""}</span>
      <span>
        {matches ? "View locked as Home" : "Lock this view"}
        <span className="block text-xs text-grid-text-dim">
          {matches ? "Tap to unlock" : home ? "Replace your locked Home view" : "Home and new tabs open with this layout and zoom"}
        </span>
      </span>
    </button>
  );
}

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const pointerCoarse = useUiPrefsStore((s) => s._pointerCoarse);
  const effectiveMode = useEffectiveFocusMode();
  const setFocusMode = useUiPrefsStore((s) => s.setFocusMode);
  const blurGraphicImages = useUiPrefsStore((s) => s.blurGraphicImages);
  const toggleBlurGraphicImages = useUiPrefsStore((s) => s.toggleBlurGraphicImages);

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
          className="absolute right-[5px] top-full mt-1 w-56 bg-grid-bg border border-grid-border rounded shadow-lg z-50 py-1"
        >
          <ZoomRow onFullscreen={() => { setOpen(false); toggleAppFullscreen(); }} />

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

          {/* Divider */}
          <div className="my-1 border-t border-grid-border" />

          {/* Content safety section */}
          <div className="px-3 py-1.5 text-xs font-medium text-grid-text-dim uppercase tracking-wider">
            Content
          </div>

          <label
            role="menuitemcheckbox"
            aria-checked={blurGraphicImages}
            className="w-full px-3 py-1.5 text-sm flex items-center gap-2 transition-colors text-grid-text hover:bg-grid-hover/15 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={blurGraphicImages}
              onChange={toggleBlurGraphicImages}
              className="rounded border-grid-border bg-grid-bg text-grid-accent focus:ring-grid-accent focus:ring-offset-0 w-3.5 h-3.5 shrink-0"
            />
            <span>
              Blur potentially graphic images
              <span className="block text-xs text-grid-text-dim">
                Blurs thumbnails with graphic content warnings
              </span>
            </span>
          </label>

          {isHostedBuild() && (
            <>
              <div className="my-1 border-t border-grid-border" />
              {/* Server route: works even if this app's state is broken. */}
              <a
                role="menuitem"
                href={KAHUNA_RETURN_PATH}
                className="block w-full px-3 py-1.5 text-sm text-grid-text hover:bg-grid-hover/15"
              >
                Back to Kahuna
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
