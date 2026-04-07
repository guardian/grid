/**
 * Orchestration: search — imperative coordination functions for search workflows.
 *
 * This module holds module-level mutable state and exported functions that are
 * called by multiple UI components (SearchBar, ImageTable, ImageMetadata,
 * ImageDetail) and hooks (useScrollEffects, useUrlSearchSync).
 *
 * Previously these lived inside components and hooks, creating cross-component
 * imports (ImageTable importing from SearchBar, etc.). Moving them here makes
 * the dependency direction strictly downward:
 *   components → hooks → lib → dal
 *
 * **No logic was changed.** Every function body is verbatim from its original
 * location.
 */

import { useSearchStore } from "@/stores/search-store";
import { getScrollContainer } from "@/lib/scroll-container-ref";
import { resetVisibleRange } from "@/hooks/useDataWindow";

// ===========================================================================
// Debounce cancellation (from SearchBar.tsx)
// ===========================================================================

// Module-level debounce cancellation
//
// handleCellClick in ImageTable updates the query directly (bypassing the
// CQL editor's debounced flow).  Any pending debounce from a prior editor
// queryChange must be invalidated so it doesn't revert the query.
//
// We track the last query that was set externally (via cancelSearchDebounce).
// The debounce callback checks this and skips if the URL has already moved on.

export let _debounceTimerId: ReturnType<typeof setTimeout> | null = null;
export function setDebounceTimer(id: ReturnType<typeof setTimeout> | null) {
  _debounceTimerId = id;
}

export let _externalQuery: string | null = null;
export function setExternalQuery(q: string | null) {
  _externalQuery = q;
}

let _cqlInputGeneration = 0;

/**
 * Cancel any pending debounced query update from the CQL search input.
 * Call this before programmatically updating the query from outside the
 * CQL editor (e.g. shift/alt-click on a table cell).
 *
 * @param newQuery — the query that the external caller is about to set.
 *   Stored so the debounce callback can detect and skip stale updates.
 */
export function cancelSearchDebounce(newQuery?: string) {
  if (_debounceTimerId) {
    clearTimeout(_debounceTimerId);
    _debounceTimerId = null;
  }
  _externalQuery = newQuery ?? null;
  // Bump generation to force CqlSearchInput to remount with the new value.
  // The @guardian/cql <cql-input> web component doesn't reliably re-render
  // chips when only polarity changes (its ProseMirror document model may not
  // distinguish +field:value from -field:value). A fresh mount picks up
  // the new value correctly.
  _cqlInputGeneration++;
}

/** Current generation counter — used as a React key on CqlSearchInput. */
export function getCqlInputGeneration() {
  return _cqlInputGeneration;
}

// ===========================================================================
// Scroll-reset orchestration (from useScrollEffects.ts)
// ===========================================================================

let _virtualizerReset: (() => void) | null = null;

/**
 * Register the virtualizer's scrollToOffset(0) callback.
 * Called by useScrollEffects on mount; cleared on unmount.
 */
export function registerVirtualizerReset(fn: (() => void) | null) {
  _virtualizerReset = fn;
}

// ---------------------------------------------------------------------------
// Scroll-to-focused orchestration (FullscreenPreview exit)
// ---------------------------------------------------------------------------

let _scrollToFocused: (() => void) | null = null;

/**
 * Register a callback that scrolls the virtualizer to bring the currently
 * focused image into view. Called by useScrollEffects on mount; cleared on
 * unmount.
 *
 * Used by FullscreenPreview on exit — after traversing images in fullscreen,
 * the focused image may have moved outside the table/grid viewport.
 */
export function registerScrollToFocused(fn: (() => void) | null) {
  _scrollToFocused = fn;
}

/**
 * Scroll the active grid/table virtualizer to bring the focused image into
 * view. No-op if no virtualizer is registered or no image is focused.
 *
 * Uses `align: "center"` — same as useReturnFromDetail — because the user
 * has been in a focused view (fullscreen preview) and needs reorientation
 * with equal context above and below.
 */
export function scrollFocusedIntoView(): void {
  _scrollToFocused?.();
}

/**
 * Imperatively prepare for a "go home" transition — called by SearchBar logo,
 * ImageDetail logo, and metadata clicks. Orchestrates:
 * 1. Abort in-flight extends (buffer corruption prevention)
 * 2. Scroll reset (eager when safe, deferred when stale — see below)
 * 3. Reset visible range (Scrubber thumb sync)
 * 4. Direct scrubber thumb DOM reset (instant visual signal)
 * 5. Focus CQL input (next frame)
 *
 * Scroll-reset strategy (same logic as the Home key handler in
 * useListNavigation.ts):
 *
 * - **bufferOffset === 0:** The buffer already contains the correct first-page
 *   data. Eager `scrollTop = 0` is safe — it just scrolls within correct
 *   content. No flash possible.
 *
 * - **bufferOffset > 0:** The buffer has stale deep-offset data. Eager
 *   `scrollTop = 0` would briefly show wrong images (the "flash"). Leave
 *   the scroll reset to effect #8 (BufferOffset→0 guard) in useScrollEffects,
 *   which fires in the same layout frame as the data swap when `search()`
 *   sets bufferOffset back to 0.
 *
 * - **skipEagerScroll:** When called from `resetToHome()`, the current view
 *   is about to be unmounted by a programmatic navigation. Resetting its
 *   scrollTop eagerly just creates a visible flash (table jumps to top
 *   before the grid replaces it). Skip the eager reset entirely — the grid
 *   mounts at scrollTop=0 naturally.
 */
export function resetScrollAndFocusSearch(opts?: { skipEagerScroll?: boolean }): void {
  // Abort in-flight extends and set cooldown — prevents stale
  // extendBackward from corrupting the buffer during the transition.
  useSearchStore.getState().abortExtends();

  // Scroll reset — only when the buffer is at the start (bufferOffset 0)
  // and the caller hasn't asked to skip (resetToHome skips because the
  // view is about to be replaced by navigation).
  // When deep (bufferOffset > 0), effect #8 handles it after data arrives.
  if (!opts?.skipEagerScroll && useSearchStore.getState().bufferOffset === 0) {
    const scrollContainer = getScrollContainer();
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
      scrollContainer.scrollLeft = 0;
    }
    _virtualizerReset?.();
  }

  // Reset the visible range so the Scrubber thumb reflects position 0
  // without waiting for the scroll handler to fire.
  resetVisibleRange();

  // Directly reset the scrubber thumb DOM position to top — instant
  // visual signal that "I'm going home" without flashing wrong images.
  const thumb = document.querySelector<HTMLElement>("[data-scrubber-thumb]");
  if (thumb) thumb.style.top = "0px";

  // Focus CQL input — but only if we're in search/results view, not image
  // detail view. The CQL input exists in the DOM even when image detail is
  // open (it's part of the layout) — focusing it there steals keyboard
  // shortcuts (the 'f' fullscreen shortcut sees an editable target and
  // requires Alt, while bare 'f' types into the hidden search box).
  requestAnimationFrame(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("image")) return;
    const cqlInput = document.querySelector("cql-input");
    if (cqlInput instanceof HTMLElement) cqlInput.focus();
  });
}

// ===========================================================================
// URL search sync reset (from useUrlSearchSync.ts)
// ===========================================================================

/** Module-level ref for the dedup comparison string. Shared between
 *  useUrlSearchSync (writes on every sync) and resetSearchSync (clears
 *  to force a re-search on the next URL change or re-render). */
export let _prevParamsSerialized = "";
export function setPrevParamsSerialized(s: string) {
  _prevParamsSerialized = s;
}

/** Previous search-only params (not serialized) for sort-only change detection. */
export let _prevSearchOnly: Record<string, unknown> = {};
export function setPrevSearchOnly(obj: Record<string, unknown>) {
  _prevSearchOnly = obj;
}

/**
 * Reset the search sync dedup state so the next render cycle of
 * useUrlSearchSync will treat the current params as "new" and trigger
 * a fresh search. Call this from logo onClick handlers (both SearchBar
 * and ImageDetail) to ensure "reset everything" always works, even
 * when the URL search params haven't actually changed.
 */
export function resetSearchSync() {
  _prevParamsSerialized = "";
  _prevSearchOnly = {};
}

