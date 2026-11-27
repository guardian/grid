# Kupua — Elasticsearch Usage Audit

> April 4, 2026. Codebase at `61b042101`.
>
> Scope: every ES interaction in kupua — request types, PIT lifecycle, abort
> patterns, safety guards, resource leaks, dead code, and multi-user impact
> on shared clusters (TEST/CODE/PROD).

## Summary Table

| # | Severity | Issue | Impact |
|---|----------|-------|--------|
| 1 | 🔴 HIGH | PIT race condition — stale PIT causes 404s + 200–400ms wasted per seek | ✅ FIXED — PIT generation counter |
| 2 | 🔴 HIGH | PIT leak on tab close / navigation | ✅ MITIGATED — keepalive 5m → 1m |
| 3 | 🟡 MEDIUM | `frozenUntil` is dead code — set but never read | ✅ REMOVED |
| 4 | 🟡 MEDIUM | `fetchExpandedAgg` has no AbortController | ✅ FIXED — abort on search() |
| 5 | 🟡 MEDIUM | Composite agg walk can issue 50+ sequential requests | One scrubber seek on high-cardinality keyword sort = expensive |
| 6 | 🟢 LOW | `_fillBufferForScrollMode` holds stale PIT for duration of fill loop | PIT 404s if `search()` fires mid-fill |
| 7 | 🟢 LOW | New-images poll runs unconditionally every 10s on real ES | 6 `_count` requests/minute per tab |
| 8 | ℹ️ INFO | `_pit` in ALLOWED_ES_PATHS enables DELETE verb on real clusters | Intentional, but worth documenting |
| 9 | ℹ️ INFO | No request-rate safety net on seek's binary search refinement | Up to 50 `_count` calls in rapid succession |

---

## 1. 🔴 PIT Race Condition — Stale PIT Causes 404s — ✅ FIXED

**Fix applied:** Option A — PIT generation counter. `_pitGeneration` bumped
in `search()` on new PIT. `seek`/`extend*`/`restoreAroundCursor` capture the
generation at call start and use `null` for pitId if it changed, skipping the
stale PIT and avoiding the 404 round-trip.

### What happens

`search()` closes the old PIT (fire-and-forget) and opens a new one.
`seek()` and `extendForward`/`extendBackward` read `get().pitId` — which
is the PIT from the *most recent search*. If `search()` fired between the
time a seek/extend captured `pitId` and the time it sends the `searchAfter`
request, the PIT is already closed. ES returns 404. The retry-without-PIT
fallback adds ~100–200ms latency per round-trip over SSH tunnel.

In the log you captured, this happens **twice per seek** (once for seek
itself, once for the `extendForward` that follows), wasting ~200–400ms.

### Why it matters

Every scrubber click on real ES hits this. The user feels sluggishness
that doesn't exist on local ES (where PITs are disabled).

### Fix options

**Option A: PIT generation counter (minimal change)**
Add a `_pitGeneration: number` to the store. `search()` bumps it when
opening a new PIT. `seek`/`extend` capture both `pitId` and `_pitGeneration`
at call start. Before calling `searchAfter`, compare: if generation changed,
skip the stale PIT and call the index-based path directly.

- ✅ Eliminates the wasted 404 round-trip
- ✅ ~10 lines of code
- ❌ Doesn't address the fundamental lifecycle issue (seek still loses PIT isolation)

**Option B: Seek opens its own PIT**
When `seek()` starts, it opens a fresh PIT for its own use and passes it
to all subsequent `searchAfter` + `countBefore` calls. It closes the PIT
when seek completes. Extends after seek get a valid PIT from the seek's result.

- ✅ Full snapshot isolation for the seek+extend cycle
- ✅ No race with `search()`
- ❌ One extra `openPit` round-trip per seek (~20ms on local, ~100ms on tunnel)
- ❌ More complex PIT ownership model

**Option C: Don't use PITs for seek at all**
Seeks are always point-in-time discrete operations (land at position X).
The extends that follow use cursors with concrete sort values. On a live
index, the only risk is a few-document drift at boundaries (a new upload
shifts the sort position by 1). This is invisible to the user.

- ✅ Simplest: just pass `null` for pitId in seek
- ✅ Eliminates all PIT-related errors in seek path
- ❌ Lose snapshot isolation for the seek (but extends keep the PIT from search)

**Recommendation:** Option A as immediate fix (quick win, eliminates noise).
Consider Option C for simplification — seek's snapshot isolation adds minimal
value given that `countBefore` already runs without a PIT and the user can't
perceive a 1-doc position drift.

---

## 2. 🔴 PIT Leak on Tab Close / Navigation — ✅ MITIGATED

**Fix applied:** Option C — reduced PIT keepalive from 5m to 1m. Three
locations: `openPit()` default parameter, `searchAfter()` body keep_alive,
`search()` call site. Orphaned PITs now expire in 1 minute instead of 5.

### What happens

When the user closes the tab, navigates away, or the page refreshes,
the current PIT is never closed. ES keeps the PIT alive for 5 minutes,
holding segment references that prevent segment merging.

### Why it matters

With N concurrent users, each doing M searches per session, there are up
to N orphaned PITs at any time (one per user's most recent search). On
PROD with 200 users, that's 200 open search contexts consuming memory.
ES default limit is `search.max_open_scroll_context = 500`.

### Fix options

**Option A: `beforeunload` handler + `navigator.sendBeacon`**
On `beforeunload`, send a `DELETE /_pit` via `sendBeacon` (which survives
tab close). Store the current pitId in a module-level variable accessible
to the handler.

- ✅ Releases PITs on tab close, refresh, navigation
- ✅ `sendBeacon` is reliable even during page unload
- ❌ `sendBeacon` can only send POST (not DELETE). Would need a tiny proxy
  endpoint or a workaround (POST to a custom close-pit path).
- ❌ Actually: `sendBeacon` sends POST with `text/plain` content type.
  ES `_pit` DELETE requires `application/json` body. Doesn't work directly.

**Option B: `visibilitychange` handler**
When the page becomes hidden (`document.hidden === true`), close the PIT.
When it becomes visible again, the next `search()` or `extend()` opens a
new one.

- ✅ Works for tab switches and minimise
- ❌ Doesn't fire on sudden tab close / browser quit
- ❌ Over-aggressive: closing PIT on every tab switch means extends lose
  isolation when the user returns

**Option C: Reduce PIT keepalive to 1 minute**
Currently 5 minutes. Reducing to 1m means orphaned PITs expire faster.
The retry-without-PIT fallback already handles expiration gracefully.

- ✅ Zero code change (just change the string "5m" → "1m")
- ✅ Reduces window of resource consumption by 80%
- ❌ Active users who pause >1 minute hit more PIT expirations (but fallback handles it)

**Option D: Accept it**
The 5-minute auto-expiry is ES's designed cleanup mechanism. 200 PITs ×
5 minutes is well within typical cluster capacity. The 500 context limit
is configurable. Grid's existing Kahuna doesn't close scroll contexts
on unload either.

**Recommendation:** Option C (reduce to 1m) as immediate pragmatic fix.
Consider Option A if multi-user scale testing reveals actual pressure on
the context limit. Document the trade-off in infra-safeguards.md.

---

## 3. 🟡 `frozenUntil` — Dead Code — ✅ REMOVED

**Fix applied:** Option A — removed all 4 references (interface declaration,
initialisation, two set calls in `search()`). Dead code that was set but never
read. If corpus pinning is needed for a PIT-free architecture in the future,
re-implement intentionally.

### What happens

`frozenUntil` is declared in the store (line 109), initialised to `null`
(line 925), and set to `new Date().toISOString()` on search completion
(lines 1046, 1071). **Nothing reads it.**

The original intent was probably to pin the result set for local ES
(where PITs are disabled) by adding a `range.uploadTime.lte` filter to
subsequent extends. This was never implemented.

### Why it matters

Without corpus pinning (either PIT or frozenUntil), the `total` count
can fluctuate between `search()` and `extendForward()` on a live index.
The scrubber and status bar use `total` — a jump from 1,318,609 to
1,318,615 causes a visible flicker.

More importantly: `search_after` cursors can drift if new documents are
indexed with sort values that fall within the current page's sort range.
The PIT prevents this on real ES, but on local ES (where PIT is skipped
and Thrall isn't running), the risk is zero. So the dead code is harmless
today, but represents a gap for future production use.

### Fix options

**Option A: Remove it** — dead code is confusing. If needed later,
re-implement intentionally.

**Option B: Implement it** — on `extend`/`seek`, if no PIT is available,
add `range.uploadTime.lte: frozenUntil` to the query. This pins the
corpus cheaply without a PIT.

**Recommendation:** Option A for now. The PIT covers real ES, and local
ES doesn't need it. If kupua moves to a PIT-free architecture, revisit.

---

## 4. 🟡 `fetchExpandedAgg` Has No AbortController — ✅ FIXED

**Fix applied:** Added `_expandedAggAbortController` (module-level). Created
and passed as signal to `getAggregations()` in `fetchExpandedAgg`. Aborted
by `search()` when a new search starts, preventing stale expanded agg data
from overwriting fresh results.

### What happens

When the user clicks "Show more" on a facet filter, `fetchExpandedAgg`
calls `dataSource.getAggregations()` without an `AbortSignal`. If the
user changes the search query while the expanded agg is in-flight, the
response arrives and writes stale data into `expandedAggs`.

### Why it matters

The stale expanded agg shows bucket counts from a previous query. It's
visually wrong but not dangerous (no writes). The uncancellable request
also wastes an ES round-trip.

### Fix

Add an abort controller to `fetchExpandedAgg`, aborted when a new
`search()` fires (same pattern as `_aggAbortController`). ~5 lines.

---

## 5. 🟡 Composite Agg Walk for Keyword Seek

### What happens

`findKeywordSortValue` pages through a composite aggregation to find the
keyword value at a given position. With `BUCKET_SIZE = 10_000`, on a
field like `credit` with 769 unique values, this takes 1 page. But on a
hypothetical field with 500k unique values, it would take 50 pages.

The walk has an 8-second time cap and a `MAX_PAGES = 50` limit, but each
page is a sequential ES request. On TEST via SSH tunnel (~100ms per
request), 50 pages = 5 seconds of sequential ES queries.

### Why it matters

This is the worst case for a single user interaction (scrubber click on
a high-cardinality keyword sort). It ties up one ES search thread per
request for the duration. With 10 concurrent users seeking on the same
sort, that's potentially 500 search threads occupied.

In practice, the only keyword sorts are Credit (~769 unique values),
Filename (~1.3M unique), and config-driven aliases. Credit takes 1 page.
Filename would take 130 pages (capped at 50). The real risk is adding a
new sortable keyword column with very high cardinality.

### Fix options

**Option A: Document the risk** — note that new keyword sort columns
should be assessed for cardinality before enabling seek.

**Option B: Cache the distribution** — `getKeywordDistribution` already
fetches the full distribution and caches it. The seek path could use the
cached distribution instead of running its own composite walk.

**Recommendation:** Option B — the cached distribution is already there.
The seek should consult it before falling back to the composite walk.
Low priority since current fields are low-cardinality.

---

## 6. 🟢 `_fillBufferForScrollMode` Holds Stale PIT

### What happens

When `total ≤ SCROLL_MODE_THRESHOLD` (10,000), `search()` triggers
`_fillBufferForScrollMode` which loops, calling `searchAfter` with the
PIT from the initial search. If the user triggers a new `search()` while
the fill loop is running, the fill loop's PIT is closed by the new
search, causing 404s on subsequent iterations.

### Why it matters

The fill loop checks `signal.aborted` on each iteration, and the new
`search()` aborts the range controller — so in practice the loop stops
quickly. The 404 only happens if the abort and the `searchAfter` call
race. Low impact because scroll-mode fill only runs on small result sets.

### Fix

No action needed. The abort check already handles this. The 404 retry
fallback handles the edge case.

---

## 7. 🟢 New-Images Poll Runs Every 10s

### What happens

`startNewImagesPoll` fires a `_count` request every 10 seconds to check
for newly uploaded images. This runs for the lifetime of the tab.

### Why it matters

On real ES via tunnel, that's 6 `_count` requests per minute per tab.
`_count` is cheap (~5ms on ES), but with 200 users it's 1,200
requests/minute of background load. Not dangerous, but not free.

### Fix options

**Option A: Pause when tab is hidden** — use `visibilitychange` to pause
the poll when the tab isn't active.

**Option B: Increase interval** — 30s instead of 10s halves the load
with minimal UX impact.

**Option C: Accept it** — 1,200 lightweight count requests/minute is
negligible on a cluster that handles millions of search requests daily.

**Recommendation:** Option A is good hygiene and trivial (~5 lines).

---

## 8. ℹ️ `_pit` in ALLOWED_ES_PATHS Enables DELETE

### What happens

`ALLOWED_ES_PATHS` includes `_pit`, which matches both `POST /_pit`
(open) and `DELETE /_pit` (close). The `assertReadOnly` check validates
the path but not the HTTP method. This means `closePit()` can send
`DELETE` to real clusters.

### Why it's fine

PIT close is a read-side lifecycle operation — it releases a search
context, it doesn't modify data. ES documentation classifies it as a
search operation. The `DELETE` is on the `_pit` API, not on documents.
This is intentional and correct.

### Recommendation

No change needed. Document in infra-safeguards.md that `DELETE /_pit` is
an intentional exception to the "no DELETE" principle.

---

## 9. ℹ️ Binary Search Refinement — Burst of `_count` Calls

### What happens

When a keyword seek lands far from the target (drift > PAGE_SIZE), the
binary search refinement on the tiebreaker field (`id`) runs up to 50
`_count` calls in rapid succession. Each is ~5–10ms on ES, but ~100ms
over SSH tunnel. Total: ~1–5 seconds per refinement.

### Why it matters

This is rare (only triggers when a single keyword bucket has >200 docs
and the seek lands in it). On real data with Credit sort, the "PA" bucket
has 600k docs — refinement is needed for accurate positioning. The burst
is sequential (not parallel) so it doesn't overwhelm ES, but it does
occupy one search thread for the duration.

### Fix options

**Option A: Accept it** — rare, sequential, and bounded. The 50-iteration
cap limits worst-case to ~5s.

**Option B: Parallelize** — fire 5 `_count` calls at once instead of
sequentially. Reduces wall-clock time by 5×.

**Recommendation:** Accept for now. If tunnel latency makes this
noticeably slow, consider parallelisation.

---

## Request Volume Assessment (50 Concurrent Users on PROD)

| Request Type | Frequency per User | ×50 Users | ES Cost |
|---|---|---|---|
| `_search` (initial) | 1 per query change | ~50/min at peak | Normal |
| `_count` (new images poll) | 6/min constant | 300/min | Cheap |
| `_search` (extend fwd/bwd) | ~2–4 per scroll session | ~100–200/min | Normal |
| `_search` (seek) | 1 per scrubber click | ~25/min at peak | Normal |
| `_count` (countBefore) | 1–50 per seek | ~25–1250/min at peak | Cheap |
| `_search` (aggregations) | 1 per query (if panel open) | ~25/min | Medium |
| `_search` (sort distribution) | 1 per sort change (cached) | ~5/min | Light |
| `_search` (composite walk) | 1–50 per keyword seek | ~5–250/min at peak | Medium-Heavy |
| `openPit` | 1 per search | ~50/min | Cheap |
| `closePit` | 1 per search | ~50/min | Cheap |
| `_search` (expanded agg) | Rare (user clicks "more") | ~5/min | Light |
| `_search` (percentile) | 1 per date seek | ~25/min | Cheap |

**Total steady-state:** ~600–800 requests/min (mostly cheap `_count` + `_search`).
**Peak burst:** ~2000 requests/min (everyone seeking simultaneously).

For comparison, Grid's existing infrastructure handles thousands of API requests
per minute. The kupua load is comparable to adding ~2–5 more Kahuna users per
kupua user (Kahuna uses `from/size` with smaller pages, but more round-trips
for deep browsing).

**The composite agg walk is the only concerning pattern.** Everything else is
within normal ES operational parameters.






