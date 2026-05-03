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
 * How close (in buffer-local indices) the viewport must come to the buffer
 * edge before we trigger `extendBackward` or `extendForward`. With
 * BUFFER_CAPACITY = 1000 this is 5% of the buffer.
 *
 * For forward extends this is the *minimum* threshold — the actual trigger
 * point widens with recent scroll velocity (see `VELOCITY_*` knobs below).
 *
 * Lower = extends fire later (less network, but higher risk of placeholder
 * gaps during fast scroll). Higher = more headroom (more network).
 */
export const EXTEND_THRESHOLD = 50;

/**
 * EMA smoothing weight for forward-scroll velocity. New sample contribution.
 * Same convention as image-prefetch.ts. 0 = ignore new samples;
 * 1 = no smoothing (use latest sample only). 0.4 balances responsiveness
 * to bursts against noise from individual wheel events.
 */
export const VELOCITY_EMA_ALPHA = 0.4;

/**
 * How far ahead (ms) the velocity-aware forward-extend trigger predicts.
 * The effective forward threshold widens by `velocity × LOOKAHEAD_MS`,
 * capped at `PAGE_SIZE`. 400ms ≈ a typical extend round-trip on real ES,
 * so the predicted travel during a fetch is what we want to leave headroom
 * for.
 */
export const VELOCITY_LOOKAHEAD_MS = 400;

/**
 * Reset velocity state if no scroll sample arrives within this window (ms).
 * Avoids stale velocity carrying over from an unrelated earlier burst.
 * Bigger than typical wheel-event spacing (~16-50ms) but small enough that
 * a paused-then-resumed scroll starts with a clean slate.
 */
export const VELOCITY_IDLE_RESET_MS = 250;

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
 * Maximum total result count for which the store will build a lightweight
 * position map (id + sort values, ~288 bytes/entry) in the background after
 * the initial search. When total ≤ this value AND > SCROLL_MODE_THRESHOLD,
 * the scrubber enters "indexed scroll mode" — any seek is resolved via
 * exact position→sortValues lookup (one search_after call) instead of
 * percentile estimation or composite walks.
 *
 * At 65k: ~18MB V8 heap, ~5s background fetch (Phase 0 measurements).
 * Set to 0 to disable the position map entirely.
 *
 * Configurable via VITE_POSITION_MAP_THRESHOLD env var (set in .env).
 */
export const POSITION_MAP_THRESHOLD = Number(
  import.meta.env.VITE_POSITION_MAP_THRESHOLD ?? 65_000,
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
export const SEEK_COOLDOWN_MS = 100;

/**
 * After seek, dispatch a synthetic scroll event after this delay (ms) to
 * trigger reportVisibleRange for scrubber thumb sync and gap detection.
 *
 * MUST be > SEEK_COOLDOWN_MS — if it fires during cooldown, the scroll
 * event is swallowed and extendForward never runs → freeze at buffer bottom.
 * Derived as cooldown + 50ms margin (tuned down from +100; floor at +15).
 */
export const SEEK_DEFERRED_SCROLL_MS = SEEK_COOLDOWN_MS + 50;

/**
 * After each extendBackward completes, block the next extend for this long (ms).
 *
 * Purpose: prepend compensation (scrollTop += prependedRows × rowHeight) fires
 * a synthetic scroll event which would immediately trigger another extendBackward
 * before the browser has painted the compensated position. Without this cooldown,
 * cascading compensations cause visible "swimming."
 *
 * The timing chain after seek:
 *   1. SEEK_COOLDOWN_MS (100ms)    — blocks ALL extends after seek data arrives
 *   2. SEEK_DEFERRED_SCROLL_MS     — first extends fire in stable state
 *   3. POST_EXTEND_COOLDOWN_MS     — each backward extend spaces itself out
 *
 * Must be ≥ 2 paint frames (~32ms) so the browser settles between compensations.
 * Floor at 32ms (local E2E), validated at 50ms on TEST (1.3M docs).
 * See testing-regime-and-tuning-worklog.md Session 5.
 */
export const POST_EXTEND_COOLDOWN_MS = 50;

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

// ---------------------------------------------------------------------------
// Prefetch / traversal session
// ---------------------------------------------------------------------------
// These control the cadence-aware prefetch pipeline in image-prefetch.ts.
// Starting values are educated guesses — tune after Session 3 lands.
// All overridable at runtime via localStorage (see `tunable()` in
// image-prefetch.ts) so you can tweak on a real device without rebuilds:
//   localStorage.setItem('kupua.prefetch.fastCadenceMs', '500')

/**
 * Cadence below which we consider the user mid-burst (ms between
 * navigations). Below this: skip middle radius, prefetch only i±1 +
 * far lookahead. Above: full radius.
 */
export const PREFETCH_FAST_CADENCE_MS = 350;

/**
 * No navigation for this long → burst is over; fire the
 * full-radius post-burst prefetch around the resting position.
 */
export const PREFETCH_BURST_END_MS = 280;

/**
 * No navigation for this long → close the session entirely; next
 * prefetch call opens a fresh one with reset cadence.
 */
export const PREFETCH_SESSION_TIMEOUT_MS = 2000;

/**
 * During fast burst, also prefetch i±FAR_LOOKAHEAD as a guess at
 * where the user might stop.
 */
export const PREFETCH_FAR_LOOKAHEAD = 6;

/**
 * Stable cadence: prefetch i+1..i+FULL_RADIUS_AHEAD in the
 * movement direction.
 */
export const PREFETCH_FULL_RADIUS_AHEAD = 4;

/**
 * Stable cadence: prefetch i-1..i-FULL_RADIUS_BEHIND opposite
 * the movement direction.
 */
export const PREFETCH_FULL_RADIUS_BEHIND = 1;

// ---------------------------------------------------------------------------
// Selections — range-walk caps (Phase S0)
// ---------------------------------------------------------------------------

/**
 * Hard cap on the number of IDs returned by `getIdRange`.
 *
 * If the natural range contains more IDs than this, the walk stops here and
 * `IdRangeResult.truncated` is set to true. The UI shows an error toast at
 * this threshold. 5,000 was chosen as ~10× Kahuna's practical maximum.
 *
 * Configurable via VITE_RANGE_HARD_CAP env var.
 */
export const RANGE_HARD_CAP = Number(
  import.meta.env.VITE_RANGE_HARD_CAP ?? 5_000,
);

/**
 * Soft cap for `getIdRange`. When the returned ID count exceeds this value
 * the UI shows an informational toast (not an error). The selection still
 * proceeds — this is non-destructive. No confirm dialog in v1.
 *
 * Configurable via VITE_RANGE_SOFT_CAP env var.
 */
export const RANGE_SOFT_CAP = Number(
  import.meta.env.VITE_RANGE_SOFT_CAP ?? 2_000,
);

/**
 * Chunk size for `getIdRange` `search_after` walk pages.
 * 1,000 keeps each page well within ES's `max_result_window` floor.
 */
export const RANGE_CHUNK_SIZE = 1_000;

// ---------------------------------------------------------------------------
// Selections — store & reconciliation (Phase S1)
// ---------------------------------------------------------------------------

/**
 * Debounce delay (ms) for sessionStorage writes in the selection-store
 * persist adapter. Coalesces rapid toggle/shift-click sequences so that
 * e.g. 20 quick toggles produce one write instead of 20.
 */
export const SELECTION_PERSIST_DEBOUNCE_MS = 250;

/**
 * LRU cap for the selection-store metadata cache (Image objects).
 * 5,000 entries ≈ 25–50 MB V8 heap on desktop. Acceptable for v1.
 * Halve on coarse-pointer profiles if memory becomes a real issue.
 */
export const SELECTION_METADATA_LRU_CAP = 5_000;

/**
 * Number of images processed per idle frame during lazy reconciliation.
 * Lower = smoother but slower; higher = faster but may cause jank on
 * slow devices. 500 ≈ 5–10 ms per chunk at ~25 fields/image.
 */
export const SELECTION_RECONCILE_CHUNK_SIZE = 500;

// ---------------------------------------------------------------------------
// Selections -- lifecycle (Phase S6)
// ---------------------------------------------------------------------------

/**
 * When false (default): selections are cleared whenever the user navigates
 * to a new search context (query change, filter change, date-range change,
 * browser back/forward, new-images ticker click). Selections survive
 * sort-only changes, density toggles, image-detail open/close, and reload.
 *
 * When true: selections survive all navigation (today's behaviour prior to
 * S6). Useful as a developer escape hatch; flip back to false for default
 * "ephemeral selection" UX.
 *
 * When Clipboard (My Places) ships, the persistent-across-navigation model
 * moves there and this flag can be removed.
 *
 * NOT backed by import.meta.env — a plain constant; flip locally to test
 * the survival path.
 */
export const SELECTIONS_PERSIST_ACROSS_NAVIGATION = false;

// ---------------------------------------------------------------------------
// Selections -- long-press & drag gestures (Phase S5)
// ---------------------------------------------------------------------------

/**
 * Time (ms) a pointer must be held without significant movement before a
 * long-press is committed. Matches Android's default InteractionJam threshold.
 */
export const LONG_PRESS_MS = 500;

/**
 * Movement tolerance (px) before a pointerdown is reclassified as a scroll
 * gesture and the long-press timer is cancelled.
 */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

// ---------------------------------------------------------------------------
// Toasts (Phase S2.5)
// ---------------------------------------------------------------------------

/**
 * Maximum number of toasts visible at once. When the queue exceeds this,
 * the oldest toast is dropped to make room.
 */
export const TOAST_QUEUE_MAX = 5;

/**
 * Default auto-dismiss duration for 'transient' toasts (ms).
 * 0 = no auto-dismiss.
 */
export const TOAST_DEFAULT_DURATION_MS = 5_000;

