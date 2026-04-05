/**
 * Tuning constants for kupua's windowed buffer and aggregation system.
 *
 * Single source of truth for numeric knobs that control:
 * - Buffer capacity and page sizes
 * - Scroll/seek mode thresholds
 * - Aggregation timing and sizing
 * - Polling intervals
 *
 * Several constants are configurable via Vite environment variables
 * (set in .env or .env.development) to allow different values for
 * local development vs real clusters.
 */

// ---------------------------------------------------------------------------
// Buffer constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of images in the buffer at any time.
 * At ~5-10KB per image: 5-10MB. Comfortable for any device.
 * Provides ~10 screens of overscan at typical viewport heights.
 */
export const BUFFER_CAPACITY = 1000;

/**
 * Number of images to fetch per extend (forward or backward).
 * Smaller than BUFFER_CAPACITY so extends don't replace the entire buffer.
 */
export const PAGE_SIZE = 200;

/**
 * Maximum total result count for which the store will eagerly fetch ALL
 * results into the buffer after the initial page. When total ≤ this value,
 * the scrubber enters "scroll mode" (drag directly scrolls content, no
 * seek-on-pointer-up). When total > this value, the scrubber stays in
 * "seek mode" (windowed buffer, scrubber is a position-seeking control).
 *
 * Two-phase approach: search() always fetches PAGE_SIZE first (instant
 * results), then if total ≤ threshold, fires a follow-up fetch for the
 * remainder. User sees results immediately; scroll mode activates ~200-
 * 500ms later.
 *
 * Configurable via VITE_SCROLL_MODE_THRESHOLD env var (set in .env).
 */
export const SCROLL_MODE_THRESHOLD = Number(
  import.meta.env.VITE_SCROLL_MODE_THRESHOLD ?? 1000,
);

/**
 * Maximum number of rows addressable via `from/size` pagination.
 *
 * Must match the ES index's `max_result_window` setting.
 * Real clusters (TEST/PROD): 101,000 (custom setting).
 * Local docker ES: 500 (deliberately low so e2e tests exercise the deep
 * seek path with only 10k docs — see load-sample-data.sh).
 *
 * Configurable via VITE_MAX_RESULT_WINDOW env var (set in .env).
 */
export const MAX_RESULT_WINDOW = Number(
  import.meta.env.VITE_MAX_RESULT_WINDOW ?? 100_000,
);

/**
 * Threshold above which seek uses the deep path (percentile estimation +
 * search_after + countBefore) instead of from/size. Set well below
 * MAX_RESULT_WINDOW because from/size at large offsets is painfully slow
 * (~1-3s on real clusters) — ES must score and skip all preceding docs.
 * The deep path is ~20-70ms regardless of depth.
 *
 * Configurable via VITE_DEEP_SEEK_THRESHOLD env var (set in .env).
 */
export const DEEP_SEEK_THRESHOLD = Number(
  import.meta.env.VITE_DEEP_SEEK_THRESHOLD ?? 10_000,
);

// ---------------------------------------------------------------------------
// Seek timing
// ---------------------------------------------------------------------------

/**
 * After seek data arrives, block all extends for this long (ms).
 *
 * Purpose: the virtualizer re-renders and the browser fires transient scroll
 * events as it adjusts to the new content height. Without a cooldown, those
 * scroll events trigger reportVisibleRange → extendForward/extendBackward
 * before the scroll position has settled, corrupting the buffer.
 *
 * This is the PRIMARY defence against post-seek swimming. The deferred scroll
 * event fires at SEEK_DEFERRED_SCROLL_MS (cooldown + 100ms), which triggers
 * the first extends in a stable state. Each extendBackward completion also
 * sets a 200ms post-extend cooldown (in search-store.ts) to prevent cascading
 * prepend compensations.
 *
 * Lower = snappier (extendForward unblocks sooner → cells appear faster).
 * If you see buffer corruption or swimming after seek, increase this.
 */
export const SEEK_COOLDOWN_MS = 700;

/**
 * After seek, dispatch a synthetic scroll event after this delay (ms) to
 * trigger reportVisibleRange for scrubber thumb sync and gap detection.
 *
 * MUST be > SEEK_COOLDOWN_MS — if it fires during cooldown, the scroll
 * event is swallowed and extendForward never runs → freeze at buffer bottom.
 * Derived as cooldown + 100ms margin.
 */
export const SEEK_DEFERRED_SCROLL_MS = SEEK_COOLDOWN_MS + 100;

/**
 * After each extendBackward completes, block the next extend for this long (ms).
 *
 * Purpose: prepend compensation (scrollTop += prependedRows × rowHeight) fires
 * a synthetic scroll event which would immediately trigger another extendBackward
 * before the browser has painted the compensated position. Without this cooldown,
 * cascading compensations cause visible "swimming."
 *
 * The timing chain after seek:
 *   1. SEEK_COOLDOWN_MS (700ms)    — blocks ALL extends after seek data arrives
 *   2. SEEK_DEFERRED_SCROLL_MS     — first extends fire in stable state
 *   3. POST_EXTEND_COOLDOWN_MS     — each backward extend spaces itself out
 *
 * Must be ≥ 2 paint frames (~32ms) so the browser settles between compensations.
 * 200ms is conservative — may be tunable down to 50-100ms (see worklog Q4).
 */
export const POST_EXTEND_COOLDOWN_MS = 200;

/**
 * Block extends while an async search/abort is in flight (ms).
 *
 * Unlike SEEK_COOLDOWN_MS (which covers post-arrival DOM settling), this
 * covers the network round-trip. During a search() or abortExtends(), the
 * buffer is stale — extends would prepend/append data from the old query.
 * 2000ms is generous; real fetches complete in 50–500ms. The cooldown is
 * overwritten by SEEK_COOLDOWN_MS when data arrives, so the effective
 * block is max(fetch_time, SEEK_COOLDOWN_MS), not the full 2000ms.
 */
export const SEARCH_FETCH_COOLDOWN_MS = 2000;

/** How often to poll for new images (ms). */
export const NEW_IMAGES_POLL_INTERVAL = 10_000;

// ---------------------------------------------------------------------------
// Aggregation constants
// ---------------------------------------------------------------------------

/** Debounce delay for aggregation fetches (ms). Longer than search (~300ms). */
export const AGG_DEBOUNCE_MS = 500;

/** Circuit breaker threshold — if agg response exceeds this, disable auto-fetch. */
export const AGG_CIRCUIT_BREAKER_MS = 2000;

/** Default number of buckets per field in the batched request. */
export const AGG_DEFAULT_SIZE = 10;

/** Bucket count for "show more" — single-field on-demand request. */
export const AGG_EXPANDED_SIZE = 100;

