/**
 * SettingsMenu — three-dot menu in the SearchBar (far right).
 *
 * Contains UI preferences like focus mode. Opens a dropdown on click,
 * closes on outside click or Escape.
 */

import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  useUiPrefsStore,
  useEffectiveFocusMode,
  type FocusMode,
} from "@/stores/ui-prefs-store";
import { isHostedBuild, KAHUNA_RETURN_PATH } from "@/lib/hosted-config";
import { useZoomStore } from "@/stores/zoom-store";
import { imageFullscreenElement } from "@/lib/app-fullscreen";
import { readHomeView, writeHomeView, type HomeView } from "@/lib/home-view";
import { useIsCompact } from "@/hooks/useShell";
import { pressFeedback } from "@/lib/dom-utils";
import { HiJoshuaContext } from "./HiJoshua";

function ZoomRow() {
  const density = useUiPrefsStore((s) => s.density);
  const offset = useZoomStore((s) =>
    density === "justified" ? s.justifiedOffset : density === "grid" ? s.gridOffset : 0,
  );
  const range = useZoomStore((s) => (density === "table" ? null : s.ranges[density]));
  const { step, reset } = useZoomStore.getState();
  const btn =
    "w-8 h-8 flex items-center justify-center rounded text-lg text-grid-text hover:bg-grid-hover/30 disabled:text-grid-text-dim disabled:hover:bg-transparent";
  return (
    <>
      {range && density !== "table" && (
        <div className="px-3 py-1 flex items-center gap-1 text-sm text-grid-text">
          <span className="flex-1">Zoom</span>
          <button className={btn} aria-label="Smaller thumbnails" title="Smaller (−)" disabled={offset <= range[0]} onClick={() => step(density, -1)}>−</button>
          <button className="min-w-14 h-8 px-1 rounded text-xs tabular-nums hover:bg-grid-hover/30" title="Reset (0)" onClick={() => reset(density)}>
            {offset === 0 ? "Default" : offset > 0 ? `+${offset}` : `−${-offset}`}
          </button>
          <button className={btn} aria-label="Bigger thumbnails" title="Bigger (+)" disabled={offset >= range[1]} onClick={() => step(density, 1)}>+</button>
        </div>
      )}
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

function subscribeFullscreen(change: () => void) {
  document.addEventListener("fullscreenchange", change);
  return () => document.removeEventListener("fullscreenchange", change);
}

export function SettingsMenu({ inset = false, showViewControls = false }: { inset?: boolean; showViewControls?: boolean }) {
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => !!imageFullscreenElement(), () => false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openJoshua = useContext(HiJoshuaContext);

  const isCompact = useIsCompact();
  const effectiveMode = useEffectiveFocusMode();
  const setFocusMode = useUiPrefsStore((s) => s.setFocusMode);
  const blurGraphicImages = useUiPrefsStore((s) => s.blurGraphicImages);
  const toggleBlurGraphicImages = useUiPrefsStore((s) => s.toggleBlurGraphicImages);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const closeWithFocus = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (fullscreen) setOpen(false);
  }, [fullscreen]);

  // Close on outside click
  useEffect(() => {
    if (!open || fullscreen) return;
    const handleClick = (e: PointerEvent) => {
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
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeWithFocus();
      }
    };
    document.addEventListener("pointerdown", handleClick, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleClick, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, fullscreen, closeWithFocus]);

  const handleModeChange = useCallback(
    (mode: FocusMode) => {
      setFocusMode(mode);
    },
    [setFocusMode],
  );

  if (fullscreen) return null;

  return (
    <div className={`relative shrink-0${inset ? "" : " -mr-3"}`} onKeyDown={event => {
      if (!open) return;
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        closeWithFocus();
      }
    }}>
      <button
        ref={buttonRef}
        {...pressFeedback}
        onClick={toggle}
        aria-label="Settings"
        aria-expanded={open}
        aria-haspopup="menu"
        className="tap-feedback w-11 h-11 flex items-center justify-center hover:bg-grid-hover transition-colors text-grid-text-muted hover:text-grid-text"
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
          className="absolute right-[5px] top-full mt-1 w-56 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain bg-grid-bg border border-grid-border rounded shadow-lg z-50 py-1"
        >
          {showViewControls && <ZoomRow />}

          {/* Focus mode section */}
          <div className="px-3 py-1.5 text-xs font-medium text-grid-text-dim uppercase tracking-wider">
            Click mode
          </div>

          <button
            role="menuitemradio"
            aria-checked={effectiveMode === "explicit"}
            onClick={() => handleModeChange("explicit")}
            disabled={isCompact}
            className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
              isCompact
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
                {isCompact && " — always on for phones"}
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

          <div className="my-1 border-t border-grid-border" />
          <button role="menuitem" onClick={() => { setOpen(false); buttonRef.current?.focus(); openJoshua(); }}
            className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-grid-text hover:bg-grid-hover/15">
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2 16.5h1c1.33 0 2.71-.18 4-.5v3c-1.29-.32-2.67-.5-4-.5H2v-2zm20-.5v3H8v-3h14zm-11 1.5c0-.28-.22-.5-.5-.5s-.5.22-.5.5.22.5.5.5.5-.22.5-.5zm11-4.74V15h-1.5v-2.23c0-2.24-1.76-4.07-4-4.07V7.2c1.02 0 1.85-.83 1.85-1.85S17.52 3.5 16.5 3.5V2c1.85 0 3.35 1.5 3.35 3.35 0 .93-.38 1.77-1 2.38 1.87.89 3.15 2.81 3.15 5.03zm-2.5.6V15H18v-1.3c0-1.31-.92-2.05-1.97-2.05H14.5a3.35 3.35 0 0 1 0-6.7v1.5c-1.02 0-1.85.73-1.85 1.75s.83 2 1.85 2h1.53c1.87 0 3.47 1.35 3.47 3.16z" />
            </svg>
            Hello, Joshua
          </button>

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
