import { devLog } from "@/lib/dev-log";
import { useSearchStore } from "@/stores/search-store";
import { getScrollContainer } from "@/lib/scroll-container-ref";
import { resetVisibleRange } from "@/hooks/useDataWindow";
import { isMobile } from "@/lib/is-mobile";
import { withFreshKupuaKey, getCurrentKupuaKey } from "@/lib/orchestration/history-key";
import { buildHistorySnapshot } from "@/lib/build-history-snapshot";
import { snapshotStore } from "@/lib/history-snapshot";

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
 * Generation counter incremented by resetScrollAndFocusSearch().
 * The Scrubber's flash guard reads this to distinguish legitimate Home
 * resets (allow through) from transient sort-around-focus corrections
 * (suppress). See Scrubber.tsx discrete thumb sync effect.
 */
let _thumbResetGeneration = 0;
export function getThumbResetGeneration(): number {
  return _thumbResetGeneration;
}

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

  // Bump the thumb-reset generation so the Scrubber's flash guard knows
  // the next deep→0 thumbTop transition is a legitimate Home reset, not
  // a transient sort-around-focus correction. Without this, the flash
  // guard blocks the 0px write and the thumb stays stuck at the old
  // position permanently.
  _thumbResetGeneration++;

  // Focus CQL input — but only if we're in search/results view, not image
  // detail view. The CQL input exists in the DOM even when image detail is
  // open (it's part of the layout) — focusing it there steals keyboard
  // shortcuts (the 'f' fullscreen shortcut sees an editable target and
  // requires Alt, while bare 'f' types into the hidden search box).
  // Also skip on touch devices: focus would pop the on-screen keyboard.
  requestAnimationFrame(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("image")) return;
    if (isMobile()) return;
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
  devLog("[setPrevParams]", s);
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
  devLog("[resetSearchSync] clearing (was", _prevParamsSerialized, ")");
  _prevParamsSerialized = "";
  _prevSearchOnly = {};
}

// ===========================================================================
// User-initiated navigation detection
// ===========================================================================

/**
 * Module-level flag set by `useUpdateSearchParams()` BEFORE calling
 * `navigate()`. When true, `useUrlSearchSync` knows the param change was
 * caused by user interaction (filter toggle, sort change, query commit)
 * and should preserve focus/position ("Never Lost").
 *
 * When false (the default), the param change came from somewhere else —
 * most likely browser back/forward (popstate). In that case, focus
 * preservation is skipped and the view resets to the top of the restored
 * search context.
 *
 * Why invert the flag (mark user-initiated instead of popstate)?
 * TanStack Router's popstate handler is async — by the time the React
 * effect runs, a simple popstate flag may have been consumed by an
 * intermediate no-op effect run (the dedup guard bails early, but the
 * flag is already cleared). Marking user-initiated navigations is
 * synchronous and happens immediately before navigate(), so the flag
 * is guaranteed to be set when the effect processes the resulting
 * param change.
 */
let _isUserInitiatedNavigation = false;

/** Call immediately before navigate() in useUpdateSearchParams(). */
export function markUserInitiatedNavigation() {
  _isUserInitiatedNavigation = true;
}

/**
 * Read and clear the user-initiated flag.
 */
export function consumeUserInitiatedFlag(): boolean {
  const was = _isUserInitiatedNavigation;
  _isUserInitiatedNavigation = false;
  return was;
}

// ===========================================================================
// Snapshot capture — per-entry position data for back/forward restoration
// ===========================================================================

/**
 * Capture a snapshot of the current scroll/focus position, keyed by the
 * **predecessor** entry's kupuaKey.
 *
 * Called inside push helpers BEFORE navigate(). At this point the store
 * still shows pre-edit state — the URL being committed as a back target.
 * This is load-bearing for debounced typing: the first-keystroke push
 * captures the predecessor context, not the keystroke just typed.
 *
 * Reads the predecessor kupuaKey internally — callers don't pass it.
 */
export function markPushSnapshot(): void {
  const predecessorKey = getCurrentKupuaKey();
  if (!predecessorKey) {
    devLog("[markPushSnapshot] no predecessor kupuaKey — skipping");
    return;
  }
  const snap = buildHistorySnapshot();
  snapshotStore.set(predecessorKey, snap);
  devLog("[markPushSnapshot] captured for", predecessorKey, snap);
}

// ===========================================================================
// Navigation helpers — explicit intent for every push navigate() call
// ===========================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NavigateFn = (opts: any) => any;

/**
 * Module-level flag: true when the current detail was entered via SPA
 * navigation (pushNavigate from grid/table), false when cold-loaded
 * (paste, bookmark, reload). Consumed once by ImageDetail's deep-link
 * synthesis effect to decide whether to synthesise a bare-list entry.
 *
 * SPA entry: the list entry already exists in history — no synthesis needed.
 * Cold load: no prior kupua entry exists — synthesis is required so
 * closeDetail's history.back() stays inside kupua.
 */
let _detailEnteredViaSpa = false;

export function markDetailEnteredViaSpa(): void {
  _detailEnteredViaSpa = true;
}

/** Consume (read-and-clear) the SPA-entry flag. */
export function consumeDetailEnteredViaSpaFlag(): boolean {
  const was = _detailEnteredViaSpa;
  _detailEnteredViaSpa = false;
  return was;
}

/**
 * Push-navigate with user-initiated semantics (the default for most sites).
 *
 * Calls `markUserInitiatedNavigation()` immediately before `navigate()` so
 * the resulting `useUrlSearchSync` effect knows this was a user action and
 * preserves focus/position ("Never Lost").
 *
 * Also marks the navigation as SPA-initiated so that ImageDetail's
 * deep-link synthesis knows not to insert a redundant bare-list entry
 * (the list entry already exists from the pre-detail page).
 *
 * Use this for every raw `navigate()` push call **except** logo-reset
 * (which deliberately opts out — see `pushNavigateAsPopstate`).
 *
 * Today, sites that touch only display-only keys (`image`, `density`) hit
 * the dedup guard before reading the flag, so marking is a no-op — but it
 * removes a footgun: any future change that makes one of these sites touch
 * a search-affecting key would silently trigger popstate (reset-to-top)
 * semantics without the mark.
 */
export function pushNavigate(navigate: NavigateFn, opts: Parameters<NavigateFn>[0]): void {
  // Capture snapshot for the predecessor entry BEFORE navigate fires.
  // The store is still showing pre-navigate state at this point.
  markPushSnapshot();
  markUserInitiatedNavigation();
  markDetailEnteredViaSpa();
  // Mint a fresh kupuaKey for the new history entry. Shallow-merge with
  // any caller-supplied state so both survive.
  navigate({ ...opts, state: withFreshKupuaKey(opts.state) });
}

/**
 * Push-navigate with popstate semantics (deliberately skips marking).
 *
 * The resulting `useUrlSearchSync` effect sees `consumeUserInitiatedFlag() === false`
 * and treats the navigation as a popstate — resetting to offset 0 with no
 * focus carry. This is the correct behaviour for logo-reset ("start over").
 *
 * Only logo-reset should use this. All other push sites use `pushNavigate`.
 */
export function pushNavigateAsPopstate(navigate: NavigateFn, opts: Parameters<NavigateFn>[0]): void {
  // Mint a fresh kupuaKey even though logo-reset skips snapshot capture.
  // The *next* push from this entry needs a predecessor key to capture
  // a snapshot against.
  navigate({ ...opts, state: withFreshKupuaKey(opts.state) });
}

