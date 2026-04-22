/**
 * Direction-aware image prefetch pipeline with traversal-session tracking.
 *
 * Shared between ImageDetail (traversal in detail view) and FullscreenPreview
 * (traversal in fullscreen peek). Both use the same screen-sized imgproxy URL
 * via `getCarouselImageUrl()`.
 *
 * ## Session model
 *
 * A **TraversalSession** opens on the first `prefetchNearbyImages` call
 * after idle and closes after `PREFETCH_SESSION_TIMEOUT_MS` of inactivity.
 * While open it tracks:
 *   - **Cadence** — EMA-smoothed interval between navigation calls.
 *   - **In-flight map** — `Map<imageId, HTMLImageElement>` of pending fetches.
 *   - **Direction** — last known movement direction.
 *
 * ## Cadence-aware behaviour
 *
 * - **Stable cadence** (≥ `PREFETCH_FAST_CADENCE_MS`): full radius
 *   (4 ahead + 1 behind in movement direction).
 * - **Fast burst** (< threshold): sparse radius — only i±1 + far
 *   lookahead (±`PREFETCH_FAR_LOOKAHEAD`). Skips middle to avoid
 *   wasting bandwidth on images the user will swipe past.
 * - **Post-burst debounce** (`PREFETCH_BURST_END_MS`): when the user
 *   stops, fires a full-radius batch around the resting position.
 *
 * ## Cancellation + priority
 *
 * Each call cancels in-flight prefetches that left the desired radius
 * (`img.src = ""` aborts fetch on Chromium/WebKit). `fetchPriority`
 * hints (`"high"` for i+1 and i±1 thumbnails, `"low"` for rest) keep
 * the most-needed image at the front of the browser's connection queue.
 *
 * On mobile, thumbnails are issued before full-res (cheap JPEG fallback
 * for the `data-thumb` swap at COMMIT time in `useSwipeCarousel`).
 *
 * ## Tuning
 *
 * All constants live in `@/constants/tuning.ts` and are overridable at
 * runtime via localStorage (e.g. `kupua.prefetch.fastCadenceMs`). See
 * `tunable()` below.
 */

import { getFullImageUrl, getThumbnailUrl, type FullImageOptions } from "@/lib/image-urls";
import {
  PREFETCH_FAST_CADENCE_MS,
  PREFETCH_BURST_END_MS,
  PREFETCH_SESSION_TIMEOUT_MS,
  PREFETCH_FAR_LOOKAHEAD,
  PREFETCH_FULL_RADIUS_AHEAD,
  PREFETCH_FULL_RADIUS_BEHIND,
} from "@/constants/tuning";
import type { Image as ImageRecord } from "@/types/image";

/** Screen-sized imgproxy options — stable across window resize / fullscreen. */
const screenOpts: FullImageOptions = {
  width: typeof window !== "undefined" ? window.screen.width : 1200,
  height: typeof window !== "undefined" ? window.screen.height : 1200,
};

/** True on touch devices — used to skip thumbnail prefetch on desktop. */
const isTouchDevice =
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;

/**
 * Set of image IDs whose full-res AVIF has been fully decoded (via
 * img.decode() in the prefetch pipeline, or onLoad from the center panel).
 * Used by side-panel URL selection: if an image's full-res is known-decoded,
 * the panel uses the full-res URL instead of thumbnail.
 *
 * Note: Chrome does NOT share decoded bitmaps between Image objects. This
 * Set only tracks "HTTP cache is warm + decode succeeded at least once"
 * — the DOM <img> element still needs its own decode. The data-thumb
 * fallback at COMMIT time handles the case where decode hasn't finished.
 *
 * Capped at MAX_DECODED_CACHE entries (FIFO via insertion order).
 * Module-level — survives component re-renders.
 */
const MAX_DECODED_CACHE = 30;
const _loadedFullRes = new Set<string>();

/** Evict oldest entries when the cache exceeds the cap. */
function _evictOldest(): void {
  const iter = _loadedFullRes.values();
  while (_loadedFullRes.size > MAX_DECODED_CACHE) {
    const first = iter.next().value;
    if (first !== undefined) _loadedFullRes.delete(first);
    else break;
  }
}

/** True if the full-res AVIF for this image has been decoded. */
export function isFullResLoaded(imageId: string): boolean {
  return _loadedFullRes.has(imageId);
}

/** Mark an image's full-res as decoded (called from center panel onLoad). */
export function markFullResLoaded(imageId: string): void {
  if (!_loadedFullRes.has(imageId)) {
    _loadedFullRes.add(imageId);
    _evictOldest();
  }
  _notifyListeners(imageId);
}

// ── Decode-completion subscription ──────────────────────────────
// Lets React components react when a specific image's full-res becomes
// available (e.g. side panel upgrades from thumbnail to full-res).
type DecodeListener = (imageId: string) => void;
const _listeners = new Set<DecodeListener>();

/** Subscribe to decode completions. Returns an unsubscribe function. */
export function onFullResDecoded(cb: DecodeListener): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function _notifyListeners(imageId: string): void {
  for (const cb of _listeners) cb(imageId);
}

// ── Traversal session ───────────────────────────────────────────
// A TraversalSession tracks one user burst (held arrow key or chain of
// swipes). It opens on the first prefetchNearbyImages call after idle
// and closes after SESSION_TIMEOUT_MS of inactivity. While open it
// tracks cadence, in-flight requests, and cancels prefetches that
// leave the desired radius.
//
// Module-level singleton — one session at a time.

/** Runtime-tunable constant reader. Reads localStorage on every call so
 *  DevTools edits take effect on the next navigation without rebuilds.
 *  Falls back to the compiled constant when localStorage is absent or
 *  the stored value is not a finite number. */
function tunable(key: string, fallback: number): number {
  if (typeof localStorage === "undefined" || typeof localStorage.getItem !== "function") return fallback;
  const raw = localStorage.getItem(`kupua.prefetch.${key}`);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Read a prefetch tuning constant with localStorage override. */
export function getTunable(key: string): number {
  switch (key) {
    case "fastCadenceMs":    return tunable(key, PREFETCH_FAST_CADENCE_MS);
    case "burstEndMs":       return tunable(key, PREFETCH_BURST_END_MS);
    case "sessionTimeoutMs": return tunable(key, PREFETCH_SESSION_TIMEOUT_MS);
    case "farLookahead":     return tunable(key, PREFETCH_FAR_LOOKAHEAD);
    case "fullRadiusAhead":  return tunable(key, PREFETCH_FULL_RADIUS_AHEAD);
    case "fullRadiusBehind": return tunable(key, PREFETCH_FULL_RADIUS_BEHIND);
    default:                 return NaN;
  }
}

/**
 * Compute exponentially-smoothed cadence (ms between navigations).
 * Weight 0.4 on the new interval — responsive to speed changes but
 * smooths jitter from inconsistent touch timing.
 *
 * Pure function — exported for unit testing.
 */
export function computeCadence(
  prevCadence: number | null,
  intervalMs: number,
): number {
  if (prevCadence == null) return intervalMs;
  return prevCadence * 0.6 + intervalMs * 0.4;
}

/** State held by the current traversal session. */
interface TraversalSession {
  /** Timestamp of the last prefetchNearbyImages call. */
  lastCallAt: number;
  /** EMA-smoothed interval between calls (ms), or null before 2nd call. */
  cadenceMs: number | null;
  /** Last known movement direction. */
  direction: "forward" | "backward";
  /** In-flight prefetch requests keyed by image ID. */
  inFlight: Map<string, HTMLImageElement>;
  /** setTimeout handle for post-burst full-radius prefetch. */
  pendingBurstEnd: ReturnType<typeof setTimeout> | null;
  /** setTimeout handle for session timeout (close on inactivity). */
  pendingTimeout: ReturnType<typeof setTimeout> | null;
  /** Count of images cancelled in the most recent cancelLeftRadius call. */
  lastCancelledCount: number;
}

/** The current traversal session, or null when idle. */
let _currentSession: TraversalSession | null = null;

// ── Dev-only instrumentation ────────────────────────────────────
// Ring buffer of recent prefetch events for debugging. Only populated
// in dev mode (import.meta.env.DEV).

interface PrefetchLogEntry {
  ts: number;
  tag: string;
  payload: unknown;
}

const PREFETCH_LOG_CAP = 200;
const _prefetchLog: PrefetchLogEntry[] = [];

/** Append to the dev-only prefetch log ring buffer. No-op in prod. */
export function prefetchLog(tag: string, payload?: unknown): void {
  if (!import.meta.env.DEV) return;
  _prefetchLog.push({ ts: performance.now(), tag, payload });
  if (_prefetchLog.length > PREFETCH_LOG_CAP) {
    _prefetchLog.splice(0, _prefetchLog.length - PREFETCH_LOG_CAP);
  }
  // eslint-disable-next-line no-console
  console.debug(`[prefetch] ${tag}`, payload ?? "");
}

/** Read the dev-only prefetch log (last 200 entries). */
export function getPrefetchLog(): readonly PrefetchLogEntry[] {
  return _prefetchLog;
}

/** Observable stats for the prefetch pipeline — used by tests and
 *  future debug UI. */
export interface PrefetchStats {
  inFlightCount: number;
  sessionOpen: boolean;
  cadenceMs: number | null;
  lastCancelledCount: number;
  isFastBurst: boolean;
}

/** Snapshot of current prefetch pipeline state. */
export function getPrefetchStats(): PrefetchStats {
  const fastThreshold = tunable("fastCadenceMs", PREFETCH_FAST_CADENCE_MS);
  return {
    inFlightCount: _currentSession?.inFlight.size ?? 0,
    sessionOpen: _currentSession != null,
    cadenceMs: _currentSession?.cadenceMs ?? null,
    lastCancelledCount: _currentSession?.lastCancelledCount ?? 0,
    isFastBurst: _currentSession?.cadenceMs != null && _currentSession.cadenceMs < fastThreshold,
  };
}

/** Reset all module-level prefetch state. Test-only. */
export function __resetPrefetchForTests(): void {
  if (_currentSession?.pendingBurstEnd) clearTimeout(_currentSession.pendingBurstEnd);
  if (_currentSession?.pendingTimeout) clearTimeout(_currentSession.pendingTimeout);
  _currentSession = null;
  _loadedFullRes.clear();
  _listeners.clear();
  _prefetchLog.length = 0;
}

/** Resolve the prefetch URL for an image (screen-sized, with native cap). */
function prefetchUrl(image: ImageRecord): string | undefined {
  return getCarouselImageUrl(image) ?? getThumbnailUrl(image);
}

/**
 * Canonical URL for carousel images (side panels + prefetch). Uses
 * screen dimensions + native cap. Shared between prefetch and panel
 * useMemos so the HTTP-cache-warmed URL matches what the DOM receives.
 */
export function getCarouselImageUrl(image: ImageRecord): string | undefined {
  const opts: FullImageOptions = {
    ...screenOpts,
    nativeWidth: image.source?.dimensions?.width,
    nativeHeight: image.source?.dimensions?.height,
  };
  return getFullImageUrl(image, opts);
}

/**
 * Prefetch nearby images in the buffer around `currentIndex`.
 *
 * Opens or reuses a TraversalSession. Cancels in-flight prefetches that
 * left the desired radius, then issues missing ones with fetchPriority
 * hints (thumbnails first on mobile, full-res ordered by distance).
 *
 * @param currentIndex  — local index in `results` of the currently displayed image
 * @param results       — the buffer array from the search store
 * @param direction     — movement direction ("forward" or "backward")
 */
export function prefetchNearbyImages(
  currentIndex: number,
  results: readonly (ImageRecord | undefined)[],
  direction: "forward" | "backward",
): void {
  if (currentIndex < 0 || currentIndex >= results.length) return;

  const now = performance.now();
  const timeoutMs = tunable("sessionTimeoutMs", PREFETCH_SESSION_TIMEOUT_MS);

  // Open or reuse session
  if (!_currentSession || now - _currentSession.lastCallAt > timeoutMs) {
    _closeSession();
    _currentSession = {
      lastCallAt: now,
      cadenceMs: null,
      direction,
      inFlight: new Map(),
      pendingBurstEnd: null,
      pendingTimeout: null,
      lastCancelledCount: 0,
    };
    prefetchLog("session:open");
  } else {
    // Update cadence
    const interval = now - _currentSession.lastCallAt;
    _currentSession.cadenceMs = computeCadence(_currentSession.cadenceMs, interval);
    _currentSession.lastCallAt = now;
    _currentSession.direction = direction;
    prefetchLog("session:update", { cadenceMs: _currentSession.cadenceMs, direction });
  }

  // Reset session timeout
  if (_currentSession.pendingTimeout) clearTimeout(_currentSession.pendingTimeout);
  _currentSession.pendingTimeout = setTimeout(() => {
    _closeSession();
  }, timeoutMs);

  // Build desired neighbour set: image ID → priority tier
  // Cadence-aware: fast burst → sparse radius, stable → full radius.
  const fastThreshold = tunable("fastCadenceMs", PREFETCH_FAST_CADENCE_MS);
  const isFastBurst = _currentSession.cadenceMs != null && _currentSession.cadenceMs < fastThreshold;
  const desired = _buildDesiredSet(currentIndex, results, direction, isFastBurst);

  // Cancel in-flight requests that left the radius
  _cancelLeftRadius(desired);

  // Issue missing prefetches (thumbnails first on mobile, then full-res)
  _issueMissing(currentIndex, results, desired);

  // Schedule post-burst full-radius prefetch
  _scheduleBurstEnd(currentIndex, results, direction);
}

// ── Session helpers ─────────────────────────────────────────────

/** Priority tier for a prefetch request. Maps to fetchPriority attribute. */
type PriorityTier = "high" | "low";

/** Desired prefetch entry: image index + priority tier. */
interface DesiredEntry {
  idx: number;
  priority: PriorityTier;
}

/**
 * Build the set of desired neighbours around currentIndex.
 * Returns a Map of imageId → DesiredEntry for images that exist in the buffer.
 *
 * When `fastBurst` is true (cadence below FAST_CADENCE_MS), uses a sparse
 * radius: only i±1 + far lookahead. Skips middle positions (i+2..i+N-1)
 * to avoid wasting bandwidth on images the user will swipe past.
 */
function _buildDesiredSet(
  currentIndex: number,
  results: readonly (ImageRecord | undefined)[],
  direction: "forward" | "backward",
  fastBurst: boolean,
): Map<string, DesiredEntry> {
  const radiusAhead = tunable("fullRadiusAhead", PREFETCH_FULL_RADIUS_AHEAD);
  const radiusBehind = tunable("fullRadiusBehind", PREFETCH_FULL_RADIUS_BEHIND);
  const farLookahead = tunable("farLookahead", PREFETCH_FAR_LOOKAHEAD);
  const ahead = direction === "forward" ? 1 : -1;
  const desired = new Map<string, DesiredEntry>();

  if (fastBurst) {
    // Sparse radius: i±1 (immediate neighbours) + far lookahead
    _addIfExists(desired, currentIndex + ahead, results, "high");
    _addIfExists(desired, currentIndex - ahead, results, "low");
    _addIfExists(desired, currentIndex + ahead * farLookahead, results, "low");
    _addIfExists(desired, currentIndex - ahead * farLookahead, results, "low");
  } else {
    // Full radius: movement direction i+1 (high) + i+2..i+N (low) + behind
    for (let i = 1; i <= radiusAhead; i++) {
      _addIfExists(desired, currentIndex + ahead * i, results, i === 1 ? "high" : "low");
    }
    for (let i = 1; i <= radiusBehind; i++) {
      _addIfExists(desired, currentIndex - ahead * i, results, "low");
    }
  }

  return desired;
}

/** Add an image at `idx` to the desired set if it exists in the buffer. */
function _addIfExists(
  desired: Map<string, DesiredEntry>,
  idx: number,
  results: readonly (ImageRecord | undefined)[],
  priority: PriorityTier,
): void {
  if (idx < 0 || idx >= results.length) return;
  const image = results[idx];
  if (!image) return;
  desired.set(image.id, { idx, priority });
}

/**
 * Cancel in-flight prefetches whose image ID is not in the desired set.
 * Sets `img.src = ""` to abort the fetch (works on Chromium + WebKit;
 * on Firefox the request continues but the connection slot is freed).
 */
function _cancelLeftRadius(desired: Map<string, DesiredEntry>): void {
  if (!_currentSession) return;
  let cancelled = 0;
  for (const [id, img] of _currentSession.inFlight) {
    if (!desired.has(id)) {
      img.src = "";
      _currentSession.inFlight.delete(id);
      cancelled++;
    }
  }
  _currentSession.lastCancelledCount = cancelled;
  if (cancelled > 0) {
    prefetchLog("cancel", { cancelled });
  }
}

/**
 * Issue prefetch requests for images in the desired set that aren't
 * already in-flight or fully loaded. Order:
 *   1. Thumbnails (mobile only) — cheap, critical for COMMIT fallback
 *   2. Full-res i+1 (high priority)
 *   3. Full-res remaining (low priority, in distance order)
 */
function _issueMissing(
  currentIndex: number,
  results: readonly (ImageRecord | undefined)[],
  desired: Map<string, DesiredEntry>,
): void {
  if (!_currentSession) return;

  // Sort entries by distance from current index (nearest first)
  const entries = [...desired.entries()].sort(
    (a, b) => Math.abs(a[1].idx - currentIndex) - Math.abs(b[1].idx - currentIndex),
  );

  // 1. Thumbnails first (mobile only) — i±1 get high priority, rest low
  if (isTouchDevice) {
    for (const [, { idx, priority }] of entries) {
      const image = results[idx];
      if (!image) continue;
      const thumb = getThumbnailUrl(image);
      if (!thumb) continue;
      const img = new Image();
      // fetchPriority is a newer attribute — type assertion needed
      (img as unknown as Record<string, unknown>).fetchPriority =
        Math.abs(idx - currentIndex) <= 1 ? "high" : "low";
      img.src = thumb;
    }
  }

  // 2. Full-res — skip already-loaded or already-in-flight
  for (const [id, { idx, priority }] of entries) {
    if (_loadedFullRes.has(id)) continue;
    if (_currentSession.inFlight.has(id)) continue;

    const image = results[idx];
    if (!image) continue;
    const url = prefetchUrl(image);
    if (!url) continue;

    const img = new Image();
    (img as unknown as Record<string, unknown>).fetchPriority = priority;
    img.src = url;

    // Track in-flight
    _currentSession.inFlight.set(id, img);

    // On mobile: decode() to populate _loadedFullRes for side-panel URL selection
    if (isTouchDevice) {
      const capturedId = id;
      img.decode().then(
        () => {
          _loadedFullRes.add(capturedId);
          _evictOldest();
          _notifyListeners(capturedId);
          // Remove from in-flight — it's done
          _currentSession?.inFlight.delete(capturedId);
        },
        () => {
          // Decode failed (404, broken image) — remove from in-flight but don't mark
          _currentSession?.inFlight.delete(capturedId);
        },
      );
    } else {
      // Desktop: no decode(), just cache-warming. Track load completion.
      const capturedId = id;
      img.onload = () => { _currentSession?.inFlight.delete(capturedId); };
      img.onerror = () => { _currentSession?.inFlight.delete(capturedId); };
    }
  }

  prefetchLog("issue", {
    desired: desired.size,
    issued: _currentSession.inFlight.size,
    skippedLoaded: [...desired.keys()].filter((id) => _loadedFullRes.has(id)).length,
  });
}

/**
 * Schedule the post-burst full-radius prefetch. Called on every navigation.
 * Clears any previous pending burst-end, then sets a new one at BURST_END_MS.
 * When it fires: recomputes desired at full (stable) radius, cancels stale
 * in-flight, issues missing. The session stays open — SESSION_TIMEOUT_MS
 * handles final close.
 */
function _scheduleBurstEnd(
  currentIndex: number,
  results: readonly (ImageRecord | undefined)[],
  direction: "forward" | "backward",
): void {
  if (!_currentSession) return;
  const burstEndMs = tunable("burstEndMs", PREFETCH_BURST_END_MS);

  if (_currentSession.pendingBurstEnd) clearTimeout(_currentSession.pendingBurstEnd);
  _currentSession.pendingBurstEnd = setTimeout(() => {
    if (!_currentSession) return;
    prefetchLog("burst:end", { currentIndex, direction });

    // Recompute at full (stable) radius — not fast-burst
    const desired = _buildDesiredSet(currentIndex, results, direction, false);
    _cancelLeftRadius(desired);
    _issueMissing(currentIndex, results, desired);
  }, burstEndMs);
}

/** Close the current session. Let in-flight finish (don't cancel). */
function _closeSession(): void {
  if (!_currentSession) return;
  if (_currentSession.pendingBurstEnd) clearTimeout(_currentSession.pendingBurstEnd);
  if (_currentSession.pendingTimeout) clearTimeout(_currentSession.pendingTimeout);
  prefetchLog("session:close", { inFlight: _currentSession.inFlight.size });
  _currentSession = null;
}


