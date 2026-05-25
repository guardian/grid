/**
 * AiSearchInput — expandable AI query input, separate from CQL.
 *
 * Collapsed: a yellow sparkles button (toggle).
 * Expanded: yellow-bordered container with sparkles icon + text input.
 *
 * The "active/expanded" state is LOCAL — clicking sparkles expands the input
 * but writes nothing to the URL. Only once the user types something does the
 * URL get `aiQuery:"..."`. This avoids half-born chips in the URL.
 *
 * CQL never sees `aiQuery:"..."` — this component owns that part of the
 * URL query string independently. The parent (SearchBar) orchestrates
 * combining the CQL part and the AI part for the URL.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { bedrockAvailable, subscribeBedrockAvailable } from "@/lib/grid-config";

let _stashedAiText: string | null = null;

interface AiSearchInputProps {
  /** Current AI text from URL (null = no AI chip in URL). */
  aiText: string | null;
  /** Called with non-empty text to write to URL, or null to remove from URL. */
  onAiTextChange: (text: string | null) => void;
}

export function AiSearchInput({ aiText, onAiTextChange }: AiSearchInputProps) {
  const [available, setAvailable] = useState(bedrockAvailable);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Local expanded state — independent of URL.
  const [isActive, setIsActive] = useState(aiText !== null);
  // Local text — what the user sees in the input (decoupled from URL debounce).
  const [localText, setLocalText] = useState(aiText ?? "");

  // On mount: clear stale stash if starting fresh (e.g. Home reset remounts
  // via key change). Without this, toggle-off → Home → toggle-on resurrects
  // the old query from _stashedAiText.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (aiText === null) _stashedAiText = null; }, []);

  // Sync from URL prop on external changes (back/forward, clear, page load).
  const selfCausedRef = useRef(false);
  useEffect(() => {
    if (selfCausedRef.current) {
      selfCausedRef.current = false;
      return;
    }
    // External change: sync local state.
    if (aiText !== null) {
      setIsActive(true);
      setLocalText(aiText);
    } else {
      setIsActive(false);
      setLocalText("");
    }
  }, [aiText]);

  useEffect(() => {
    setAvailable(bedrockAvailable);
    return subscribeBedrockAvailable(setAvailable);
  }, []);

  // Auto-focus when expanding.
  const prevActive = useRef(isActive);
  useEffect(() => {
    if (isActive && !prevActive.current) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    prevActive.current = isActive;
  }, [isActive]);

  const handleToggle = useCallback(() => {
    if (isActive) {
      // Deactivate — stash text, remove from URL.
      _stashedAiText = localText || null;
      setIsActive(false);
      setLocalText("");
      selfCausedRef.current = true;
      onAiTextChange(null);
    } else if (_stashedAiText) {
      // Restore stash — expand and write to URL.
      setIsActive(true);
      setLocalText(_stashedAiText);
      selfCausedRef.current = true;
      onAiTextChange(_stashedAiText);
      _stashedAiText = null;
    } else {
      // First activation — just expand, no URL write.
      setIsActive(true);
      setLocalText("");
    }
  }, [isActive, localText, onAiTextChange]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocalText(val);
      selfCausedRef.current = true;
      // Only write to URL if non-empty; remove from URL if cleared.
      onAiTextChange(val || null);
    },
    [onAiTextChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        _stashedAiText = localText || null;
        setIsActive(false);
        setLocalText("");
        selfCausedRef.current = true;
        onAiTextChange(null);
        return;
      }
      // Keep Left/Right in the input for text editing — stop them from
      // reaching useListNavigation's document listener (which would move
      // grid focus instead of the cursor).
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.nativeEvent.stopPropagation();
      }
    },
    [localText, onAiTextChange],
  );

  // Clear just the AI text — stay expanded, re-focus for a new query.
  const handleClearText = useCallback(() => {
    setLocalText("");
    selfCausedRef.current = true;
    onAiTextChange(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [onAiTextChange]);

  // Track focus for resize behavior.
  // Auto-collapse on blur when empty (user clicked away without typing).
  const [isFocused, setIsFocused] = useState(false);
  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Collapse if empty — user opened but didn't commit anything.
    if (!localText) {
      setIsActive(false);
    }
  }, [localText]);

  // Prevent blur-before-click from causing the widget to shrink and miss the
  // click target. pointerDown fires before blur on both mouse and touch;
  // preventDefault keeps focus. (mouseDown alone is too late on mobile —
  // touch-initiated blur fires before the synthesized mousedown.)
  const handleTogglePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); // don't steal focus / cause blur
    handleToggle();
  }, [handleToggle]);

  // Allow horizontal scroll of collapsed input via trackpad/wheel without focus.
  // Must use native listener (not React onWheel) because React registers wheel
  // as passive, which cannot preventDefault to stop page scroll.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const handler = (e: WheelEvent) => {
      const input = inputRef.current;
      if (!input || isFocused) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        input.scrollLeft += e.deltaX;
        e.preventDefault();
      }
    };
    wrapper.addEventListener("wheel", handler, { passive: false });
    return () => wrapper.removeEventListener("wheel", handler);
  }, [isFocused]);

  if (!available) return null;

  const hasText = localText.length > 0;

  // Collapsed-with-text: outer container gets flex-grow so it shares space
  // proportionally with CQL (which is flex-1). This avoids a cliff where
  // typing one char in CQL causes the AI widget to shrink drastically.
  // Ratio 0.7 gives AI ~41% of remaining space (0.7/(1+0.7)).
  const outerFlexStyle: React.CSSProperties | undefined =
    isActive && !isFocused && hasText
      ? { flex: '0.7 1 0px' }
      : undefined;

  // Inner div width:
  // - inactive: collapsed to 0
  // - focused+absolute: no constraint (content-sized via input size attr)
  // - blurred with text: fill outer container (outer controls allocation)
  // - blurred no text: compact placeholder width
  const inputWidthStyle: React.CSSProperties = !isActive
    ? { maxWidth: 0, opacity: 0 }
    : isFocused
      ? { opacity: 1 }
      : hasText
        ? { width: '100%', opacity: 1 }
        : { maxWidth: '10ch', opacity: 1 };

  // When focused, break out of flex flow and overlay leftward. Container sizes
  // to content (shrink-to-fit) capped by max-w ceiling (~100px from left edge).
  const positionClasses = isActive && isFocused
    ? "absolute right-7 z-10 max-w-[calc(100%-6rem)]"
    : "";

  return (
    <div
      className={`flex items-center min-w-0 gap-1 rounded border ${positionClasses} ${
        isActive
          ? hasText
            ? `border-yellow-400/80 ${isFocused ? "bg-grid-bg" : "bg-yellow-500/10"} pl-1 pr-0.5 my-px ml-1`
            : `border-yellow-500/40 ${isFocused ? "bg-grid-bg" : "bg-yellow-500/5"} pl-1 pr-0.5 my-px ml-1`
          : "group border-yellow-400/25 bg-transparent px-1.5 my-px hover:border-yellow-400 hover:bg-yellow-400/10 focus-visible:border-yellow-400 focus-visible:bg-yellow-400/10 outline-none cursor-pointer"
      }`}
      style={outerFlexStyle}
      onClick={!isActive ? handleToggle : undefined}
      onKeyDown={!isActive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); } } : undefined}
      role={!isActive ? "button" : undefined}
      tabIndex={!isActive ? 0 : undefined}
      title={isActive ? undefined : "Enable AI image search"}
      aria-label={isActive ? undefined : "Enable AI image search"}
    >
      <button
        type="button"
        onPointerDown={isActive ? handleTogglePointerDown : undefined}
        onKeyDown={isActive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); } } : undefined}
        tabIndex={isActive ? 0 : -1}
        title={isActive ? "Disable AI image search" : undefined}
        aria-label={isActive ? "Disable AI image search" : undefined}
        className={`shrink-0 transition-colors ${
          isActive ? "text-yellow-400 hover:text-yellow-300" : "text-yellow-400/50 group-hover:text-yellow-400 group-focus-visible:text-yellow-400 pointer-events-none"
        }`}
      >
        <SparklesIcon />
      </button>
      <span className={`text-yellow-400/50 group-hover:text-yellow-400 group-focus-visible:text-yellow-400 text-xs whitespace-nowrap select-none pointer-events-none overflow-hidden transition-all duration-200 ease-out ${
        isActive ? "max-w-0 opacity-0" : "max-w-[4rem] opacity-100"
      }`}>AI search</span>
      <div
        ref={wrapperRef}
        className="overflow-hidden transition-all duration-200 ease-out"
        style={inputWidthStyle}
      >
        <input
          ref={inputRef}
          type="search"
          data-grid-nav-input
          autoComplete="off"
          size={Math.max(localText.length, 21)}
          value={localText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Describe image…"
          aria-label="AI image search query"
          className="bg-transparent text-sm text-grid-text placeholder:text-grid-text-dim outline-none [&::-webkit-search-cancel-button]:hidden"
          tabIndex={isActive ? 0 : -1}
        />
      </div>
      {isActive && hasText && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleClearText}
          title="Clear AI query"
          aria-label="Clear AI query"
          className="shrink-0 text-grid-text-muted hover:text-grid-text text-xs px-0.5 rounded hover:bg-grid-hover transition-colors"
        >
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  );
}

function SparklesIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z" />
    </svg>
  );
}
