# `search_after` + Windowed Scroll — Analysis & Implementation Plan

> **Created:** 2026-03-27
> **Status:** Steps 1–12 (partial) done, checkpoints A–D passed. Limitations #1 and #8 resolved. Sort-around-focus (step 11), sort-aware tooltip (step 12 partial), backward reverse search_after, scrubber auto-hide + Shift+Arrow all complete.
> **Purpose:** Deep analysis of everything required to replace `from/size`
> pagination with `search_after`-based windowed scroll, enabling kupua to
> browse the full 9M image dataset with a custom scrubber.
>
> **Implementation note:** This plan refers to `_id` as the tiebreaker sort
> field throughout. In practice, **`id` (keyword field)** is used instead —
> ES 8.x disables fielddata on `_id` by default. Grid's `id` field always
> equals `_id` (set explicitly during indexing in `thrall/ElasticSearch.scala`).
> See `deviations.md` §18.

---

## Table of Contents

1. [Why This Matters](#why-this-matters)
2. [Philosophical Foundations](#philosophical-foundations)
3. [Current State — Where We Are](#current-state--where-we-are)
4. [The Destination — Where We Need to Be](#the-destination--where-we-need-to-be)
5. [Prior Art — Who Else Has Solved This](#prior-art--who-else-has-solved-this)
6. [Elasticsearch Deep Dive — search_after + PIT](#elasticsearch-deep-dive--search_after--pit)
7. [PIT Staleness — What the User Sees](#pit-staleness--what-the-user-sees)
8. [Architecture Design — The Windowed Buffer](#architecture-design--the-windowed-buffer)
9. [The Scrubber — UI for Position Control](#the-scrubber--ui-for-position-control)
10. [Never Lost — Sort-Around-Focus](#never-lost--sort-around-focus)
11. [Safeguards & Risk](#safeguards--risk)
12. [What We Explicitly Won't Do](#what-we-explicitly-wont-do)
13. [Browser & W3C Technologies — What Can Help](#browser--w3c-technologies--what-can-help)
14. [Dependencies & Ordering](#dependencies--ordering)
15. [Implementation Plan — Phased Work Breakdown](#implementation-plan--phased-work-breakdown)
16. [Development Workflow — When to Run the App](#development-workflow--when-to-run-the-app)
17. [Commit Strategy](#commit-strategy)
18. [Open Questions](#open-questions)
19. [Test Strategy](#test-strategy)

---

## Why This Matters

This is the single most important architectural change remaining in Phase 2.
It unblocks **six** things that are currently impossible:

| Blocked item | Why it's blocked | Perf analysis # |
|---|---|---|
| Browse beyond 100k images | `from/size` capped at `max_result_window` (101k on PROD) | #4 |
| Custom scrubber | Native scrollbar breaks at ~1M rows (33M px browser cap) | #4 |
| Sort-around-focus ("Never Lost") | Can't find focused image's new position beyond 100k | #5 |
| Memory-bounded scrolling | No page eviction — `results` array grows unboundedly | #3 |
| Array spread cost at depth | Each `loadRange` copies the full `results` array | #11 |
| Tiebreaker sort determinism | `search_after` requires `_id` tiebreaker for page boundaries | #14 |

Without this, kupua is a better kahuna but not a *fundamentally* better tool.
With it, kupua can browse 9 million images with the fluency of Google Photos.

> **Independence:** Sort-around-focus (last row) is a bonus that builds on
> the rest, not a prerequisite. Steps 1–10 deliver the scrubber and deep
> pagination even if step 11 (sort-around-focus) is deferred. If something
> is impossible, it shouldn't block the achievable benefits.

---

## Philosophical Foundations

### From `frontend-philosophy.md` — relevant principles

**"One Ordered List, Many Densities"** — The user is always at a position
in a single ordered list. Every view is a window into that list. The
scrubber is the physical manifestation of this principle — it's the
control that says "you are here" in a list of 9 million.

**"Context is Sacred"** — Focus, selection, and scroll position survive
every transition. Sort-around-focus is the hardest test of this principle:
when the user re-sorts, their focused image should stay focused at its new
position, not be lost.

**"Never Lost"** — The user should never feel lost. A scrubber with
contextual labels (dates, letters) provides spatial orientation that
infinite scroll alone cannot. At position 4.5M of 9M, the user can see
"I'm in the middle of my library, around March 2024."

### From the density continuum

The scrubber is density-independent — it represents position in the
underlying list, regardless of whether the user sees a table row, a grid
cell, or a single image. The same scrubber position means the same data
in all densities.

### The editorial use case

Picture editors at The Guardian don't scroll through 9M images — they
search and filter to narrow results. But they DO:

- Browse "all images from today" (up to 60k on a busy news day)
- Browse "all Getty images this week" (thousands)
- Sort by date taken to find historical images from a specific era
- Accidentally land on unfiltered views (9M) and need to understand where
  they are

The 100k cap truncates all but the last scenario. `search_after` doesn't
just fix edge cases — it removes a hard ceiling from the most common
filtered workflows.

---

## Current State — Where We Are

### Data flow (today)

```
User scrolls → handleScroll → reportVisibleRange(start, end)
  → 80ms debounce → gap detection (find undefined slots)
  → loadRange(gapStart, gapEnd) → ES from/size query
  → fill results[] sparse array → TanStack Virtual re-renders
```

### Key components

| Component | Role | Lines |
|---|---|---|
| `search-store.ts` | Zustand store: `results[]`, `loadMore()`, `loadRange()`, `imagePositions` Map | ~560 |
| `useDataWindow.ts` | Hook: sparse data access, gap detection (80ms debounce), `reportVisibleRange()` | ~207 |
| `es-adapter.ts` | DAL: `search()`, `searchRange()`, `buildSortClause()`, `buildQuery()` | ~444 |
| `types.ts` | DAL interface: `ImageDataSource`, `SearchParams`, `SearchResult` | ~132 |
| `ImageTable.tsx` | Table view: TanStack Table + Virtual, consumes `useDataWindow` | ~1260 |
| `ImageGrid.tsx` | Grid view: responsive columns, consumes `useDataWindow` | ~520 |
| `ImageDetail.tsx` | Image detail: overlay within search route, prev/next from store | ~varies |

### What works well (keep)

- **Sparse data model** — `results[]` with undefined gaps, `imagePositions`
  Map for O(1) lookup. This pattern translates directly to a windowed buffer.
- **Gap detection** — debounced visible range → find empty slots → load.
  The detection logic stays; only the *fetch mechanism* changes.
- **Result set freezing** — `frozenUntil` timestamp prevents offset drift.
  With PIT, this becomes even stronger (point-in-time snapshot).
- **`useDataWindow` as the view abstraction** — views never touch the store
  directly. The hook's API (`getImage`, `findImageIndex`, `reportVisibleRange`,
  `virtualizerCount`) can stay stable while internals change.
- **Generation-based abort** — `_rangeAbortController` cancelled on new
  search. Extends naturally to PIT-based fetches.

### What must change

| Current | Problem | Replacement |
|---|---|---|
| `results: Image[]` (sparse, unbounded) | Grows without limit; array spread copies all | Fixed-capacity windowed buffer (~1000 entries) with `windowOffset` |
| `from/size` in `searchRange()` | Capped at 100k; perf degrades linearly | `search_after` for sequential; `from/size` only within 100k for random jumps |
| `virtualizerCount = min(total, 100k)` | Can't represent >100k items | Decouple virtualizer from global count — virtualizer manages the *buffer*, scrubber manages the *position* |
| `loadMore()` (append-only) | No eviction, no backward seek | Replace with bidirectional buffer management |
| `buildSortClause()` — no tiebreaker | `search_after` with duplicate sort values is ambiguous | Always append `{ "_id": "asc" }` as final sort clause |
| `ALLOWED_ES_PATHS` — no `_pit` | Can't open/close PIT on non-local ES | Add `_pit` to allowed paths (read-only, no writes) |

---

## The Destination — Where We Need to Be

### Target UX

1. **User searches** → sees first page of results in table or grid. Native
   scrollbar works for the first ~1000 rows (buffer size).

2. **User scrolls normally** → gap detection fires `search_after` requests
   to fill the buffer ahead of the viewport. Distant rows behind the
   viewport are evicted. Memory stays bounded.

3. **User drags the scrubber** (or clicks a position on the track) →
   kupua seeks to that global position. The buffer is cleared and
   refilled starting at the target. A brief loading state (skeleton rows
   or shimmer) covers the fetch latency.

4. **User re-sorts** → "Never Lost": kupua finds the focused image's new
   position via count query + tiebreaker sort, seeks to it, focuses it.
   If position > buffer, animates from top to the found position.

5. **At any point**, the scrubber thumb reflects the user's position in
   the full dataset (0–100%). Contextual labels show dates/letters
   depending on the active sort field.

### Target data flow

```
                    ┌──────────────────────┐
                    │   Scrubber / scroll   │
                    └──────────┬───────────┘
                               │ seek(globalOffset)
                    ┌──────────▼───────────┐
                    │   Buffer Manager      │
                    │ (windowed, ~1000 cap) │
                    │                       │
                    │ • bufferOffset: number │ — maps buffer[0] to global position
                    │ • buffer: Image[]      │ — dense, fixed-capacity
                    │ • cursors: Map         │ — search_after cursors per boundary
                    │ • eviction logic       │
                    └──────────┬───────────┘
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
        search_after      from/size         _pit
        (sequential)    (random ≤100k)   (consistency)
```

---

## Prior Art — Who Else Has Solved This

### Google Photos (web)

The gold standard. Documented in Antin Harasymiv's 2019 talk. Key ideas
we can use directly:

- **Semantic position, not pixel offset.** Scrubber thumb = `currentPosition / total`.
- **Two scroll modes**: nearby (virtual scroll within loaded window) and
  seeking (clear + refetch at target position).
- **Date labels on scrubber track** while dragging.
- **Stable date anchors** — positions tied to dates, not offsets (resilient
  to insertions). We can't fully do this because we support non-date sorts.

What Google has that we don't: they control the backend. Their servers
likely support efficient random-access by date. We have Elasticsearch,
which gives us `search_after` (sequential) and `from/size` (random but
capped). This shapes our hybrid approach.

### iOS Photos

- **Year / Month / Day / All Photos** zoom levels with smooth transitions.
- Scrubber on the right edge with year labels.
- Under the hood: Core Data with pre-computed section indices.

What we can take: the scrubber track with contextual markers (years for
dates, first letters for keywords) is directly applicable.

### Slack message history

- Virtual scroll through years of messages.
- "Jump to date" picker for random access.
- Loading placeholder while fetching distant history.

What we can take: the "jump to date" concept maps well to our date-sorted
views. A date picker as an alternative to scrubber dragging.

### Adobe Lightroom (Classic)

- Library grid with filmstrip. Scrubber = native scrollbar on a pre-sized container.
- Works because Lightroom loads the full catalog into memory (SQLite).

Not applicable — we can't load 9M records into memory.

### VS Code file explorer / tree view

- Virtual scroll over potentially millions of tree nodes.
- No scrubber — relies on search/goto to navigate.

### AG Grid Enterprise — Server-Side Row Model

- Pagination with `startRow`/`endRow`, supports `search_after`-style cursors.
- Row cache with block-based eviction.
- Sort/filter triggers full refetch.

What we can take: the block-based cache model (fixed-size blocks, LRU
eviction) is proven. We'll implement something similar but simpler
(contiguous buffer rather than scattered blocks).

### `react-virtuoso`

- `totalCount` prop + `itemContent` callback.
- Supports "grouped mode" with sticky headers.
- Tops out at ~100k–500k items before browser height limits.

Not usable at 9M scale. Confirms we need a custom scrubber.

### TanStack Virtual (what we use)

- `count` prop drives container height via `estimateSize`.
- `scrollToIndex` for programmatic positioning.
- No built-in awareness of data loading, cursors, or scrubbers.

We keep TanStack Virtual for the *buffer window* (managing ~1000 virtual
items efficiently) and build position control on top.

### Elasticsearch official docs

ES 8.x has extensive `search_after` + PIT docs:

- `search_after` is the recommended deep pagination mechanism.
- PIT (Point In Time) provides a consistent snapshot for pagination.
- PIT + `search_after` is the ES-recommended replacement for the old
  `scroll` API (which was deprecated for non-snapshot use cases).
- PIT IDs have a configurable keepalive (default 5 minutes).

---

## Elasticsearch Deep Dive — search_after + PIT

### How `search_after` works

Normal `from/size`:
```json
{ "from": 50000, "size": 50, "sort": [{"uploadTime": "desc"}] }
```
ES must score and skip 50,000 docs. Slow. Capped at `max_result_window`.

`search_after`:
```json
{
  "size": 50,
  "sort": [{"uploadTime": "desc"}, {"_id": "asc"}],
  "search_after": [1711036800000, "abc123"]
}
```
ES jumps directly to the document whose sort values are `[1711036800000, "abc123"]`
and returns the next 50. **O(page_size)** regardless of depth. No offset cap.

The `search_after` values come from the `sort` array of the last hit in the
previous page. They're opaque cursors — the client stores them and passes
them back for the next page.

### The tiebreaker requirement

If 10,000 images have `uploadTime: 1711036800000`, `search_after` with just
`[1711036800000]` is ambiguous — ES doesn't know which of the 10,000 docs
to start after. This produces duplicate or missing results across pages.

**Fix:** Always append `{ "_id": "asc" }` as the final sort clause. Since
`_id` is unique, every document has a unique sort tuple. This is ES's
official recommendation.

**Impact:** The `sort` array in every response now includes an extra element
(the `_id`). Stored cursors include it. No user-visible change.

### Point In Time (PIT)

A PIT is a lightweight snapshot of the index state at a moment in time.
While a PIT is open, the data it sees doesn't change — even if new docs
are indexed or old ones deleted.

**Why we need it:** Without PIT, `search_after` operates against the live
index. Between two page fetches, a document could be deleted or a new one
inserted, shifting sort positions. This causes duplicates or gaps at page
boundaries — the same problem `frozenUntil` partially solves today.

PIT is stronger than `frozenUntil`:

| | `frozenUntil` | PIT |
|---|---|---|
| Mechanism | Filter: `until <= timestamp` | ES-level snapshot |
| Scope | Only upload time | All fields, all operations |
| New docs | Excluded by filter | Not visible (snapshot) |
| Deleted docs | Still visible (if before timestamp) | Still visible (snapshot) |
| Modified docs | Shows modifications | Shows pre-modification state |
| Server cost | None (just a filter) | ES keeps old segments alive (mild I/O) |
| Lifetime | Unlimited | Configurable keepalive (e.g. 5 min), renewable |
| Sort stability | Only prevents insertions before the freeze point | Full stability |

**Trade-off:** PIT holds old index segments in memory/disk on ES. For a
9M-doc index, this is trivial (ES was designed for this). The keepalive
should be reasonable (5 minutes, extended on each request).

### PIT API

```
# Open a PIT (POST, but read-only — no data mutation)
POST /images/_pit?keep_alive=5m
→ { "id": "base64-encoded-pit-id" }

# Use in search
POST /_search
{
  "pit": { "id": "...", "keep_alive": "5m" },
  "sort": [{"uploadTime": "desc"}, {"_id": "asc"}],
  "search_after": [1711036800000, "abc123"],
  "size": 50
}
# Note: no index in the URL — PIT already binds to an index

# Close a PIT (DELETE — cleanup, not a data write)
DELETE /_pit
{ "id": "..." }
```

**Important:** When using PIT, the search URL is `/_search` (no index prefix).
The PIT ID binds the request to the index. This means our Vite proxy rule
(`/es/*` → ES) and the `ALLOWED_ES_PATHS` safeguard need adjustment:

- `_pit` must be added to `ALLOWED_ES_PATHS` (it's a read-only snapshot
  operation, not a write)
- The PIT search goes to `/_search` (no index prefix) — our current proxy
  adds `/${ES_INDEX}/` prefix. Need a way to send requests without the
  index prefix.

### What about the old `scroll` API?

ES's `scroll` API was the original deep pagination mechanism. It's been
soft-deprecated since ES 7.x in favour of `search_after` + PIT. The
`scroll` API holds open a full search context (heavier than PIT), has a
maximum keepalive, and doesn't support sorting changes mid-scroll.

We should use `search_after` + PIT, not `scroll`.

### Hybrid approach: search_after + from/size

`search_after` is sequential — you can only go forward from a known cursor.
You can't jump to "position 500,000" without paginating through all
preceding pages.

For **random access** (scrubber drag to 50%), we need a different strategy:

| Strategy | How | Pros | Cons |
|---|---|---|---|
| **`from/size` within 100k** | Jump to offset directly | Simple, instant | Capped at 100k; perf degrades |
| **Sort-value estimation** | Estimate the sort value at target %. Use a range query to jump near it. | No depth limit | Requires distribution data (histogram agg). Imprecise. |
| **Pre-computed offset index** | Periodically build a position→sortValue map | Fast lookup | Stale; complex; storage cost |
| **Binary search via count** | `_count` with range filter to narrow position | Accurate; no depth limit | Multiple round trips (~log₂(total) ≈ 23 for 9M) |

**Recommended hybrid:**

1. **Sequential browsing (normal scroll)** → `search_after` + PIT.
   Forward and backward page fetches. Store cursors at buffer boundaries.

2. **Moderate jumps (≤100k from current position)** → `from/size` within
   the PIT. Fast, accurate. Used for keyboard End, short scrubber drags.

3. **Large seeks (>100k)** → Sort-value estimation from cached histogram
   aggregation. Fetch a date_histogram (or terms for non-date sorts) on
   the first search. Map scrubber position → estimated sort value →
   `search_after` with that value as the starting point. The seek lands
   *approximately* at the right position — then sequential pagination
   refines.

4. **Precise positioning (sort-around-focus)** → `_count` with a range
   query: "how many documents have (sort_value < X) OR (sort_value == X
   AND _id < Y)?". Returns the exact global offset of any document.
   Then seek to that offset using strategy 2 or 3.

### Backward pagination with search_after

`search_after` only goes forward in sort order. To go backward (scroll up),
reverse the sort order and use `search_after` with the *first* document's
sort values as the cursor. Then reverse the results client-side.

This means we need to store cursors for both the **start** and **end** of
the current buffer, and track the sort direction for each boundary.

---

## PIT Staleness — What the User Sees

This section exists because PIT introduces a usability characteristic that
should be understood explicitly, not discovered by surprise. It also
addresses a real concern: kupua's architecture allows much longer browse
sessions than kahuna, which changes the staleness calculus.

### What is PIT in one paragraph?

PIT (Point In Time) is an Elasticsearch snapshot. When kupua opens a PIT,
ES freezes a view of the index at that instant. All subsequent page fetches
using that PIT ID see the same data — new uploads, metadata edits, and
deletions are invisible until a new PIT is opened. It's like taking a
photo of the library catalogue: you browse the photo, not the live shelves.

### What's "stale" and for how long?

| Event | Without PIT (current kupua) | With PIT |
|---|---|---|
| New image uploaded | Invisible until re-search (same as now via `frozenUntil`) | Invisible until re-search (PIT snapshot) |
| Image metadata edited | **Visible immediately** on next page fetch | Invisible until re-search |
| Image deleted | **Gone immediately** (can cause gaps/duplicates) | Still visible (snapshot) — harmless |
| Image re-indexed | **Sort position may shift** (duplicates/gaps at page boundaries) | Stable — PIT prevents shifts |

### Kahuna's refresh cadence — and why kupua is different

**Kahuna refreshes its data far more often than kupua, by accident of
architecture:**

| Action | Kahuna | Kupua |
|---|---|---|
| Open an image | `$state.go('image')` → controller destroyed, image re-fetched from API, `lastSearchFirstResultTime` reset on return | Overlay on same page — no re-search, no re-fetch (data in store) |
| Return from image to search | `$state.go('search.results')` → full re-resolve: new `lastSearchFirstResultTime`, fresh search request | Close overlay — search page already mounted, scroll position preserved |
| Edit metadata on an image | Save → response updates the local resource → return to search → new `lastSearchFirstResultTime` | (Phase 2: no edits yet) |
| Navigate prev/next in image view | Not implemented (kahuna never shipped this) | `image` URL param replaced — no re-search |

In kahuna, the `lastSearchFirstResultTime` (equivalent of our `frozenUntil`)
is reset to `now()` every time the user returns to search results. Since
entering an image and coming back IS a route transition, every image view
round-trip refreshes the freeze timestamp. A user triaging 50 images sees
50 refresh points.

**In kupua, the image detail overlay preserves the search context.** The
user can browse 50 images via prev/next without a single re-search. The
`frozenUntil` timestamp is set once at search time and stays until the
next explicit search. With PIT, this extends to ALL data, not just upload
times.

**This means kupua's browse sessions can be 10–60 minutes without a
natural refresh.** Kahuna's were 1–3 minutes between refreshes.

### The real-world problem: 40 editors, one index

Consider the production scenario: 40 picture editors browsing and editing
simultaneously. Editor A edits an image's credit. Under PIT:

- Editor B, who searched 20 minutes ago and is still browsing, doesn't
  see the edit. Their PIT shows the pre-edit credit.
- Editor B clicks the image → sees stale metadata in the detail panel.
- Editor B might even edit the same field, unknowingly overwriting A's
  change. (Not a concern in Phase 2 — no writes — but a real concern for
  Phase 4+.)

This is not a show-stopper for Phase 2 (read-only, single user on TEST),
but **we need a strategy before Phase 4 (writes)**. Without one, PIT
would be a liability in production.

### Strategy: PIT for pagination stability, live data for display

The key insight: **PIT solves a pagination problem, not a freshness
problem.** We need PIT to prevent page-boundary duplicates/gaps during
scroll. We do NOT need PIT to freeze what the user sees in the metadata
panel or image detail.

**Proposed architecture (future-facing, not built now):**

```
Scroll pagination:  PIT-bound search_after  → stable positions
Metadata display:   Live fetch by ID         → always fresh
Aggregation facets: Live index               → current counts
New images ticker:  Live _count              → current reality
```

When the user opens an image (detail overlay), kupua fetches the image
by ID from the **live index** (not the PIT). If the image's metadata
changed since the PIT was opened, the user sees current data. If the
image was deleted, kupua shows a "this image has been removed" indicator
instead of a stale ghost.

**For the buffer itself:** The buffer holds images from the PIT snapshot
for position stability. If a user scrolls to an image that was edited by
another user, the buffer may show a stale credit in the table cell. This
is acceptable — the table is a scan view, not a source of truth. The
detail panel (which is where users read and edit metadata) always shows
live data.

**Phase 2 (now):** PIT for pagination. No live-fetch layer yet (no writes,
single user). Staleness is invisible.

**Phase 3 (Grid API):** Add `getById()` live fetch for metadata panel.
The panel always shows current data. Buffer cells may be slightly stale —
acceptable.

**Phase 4 (writes):** Before saving an edit, fetch the latest version
(optimistic concurrency via ES `_version` or Grid API ETag). If the
document changed since the PIT snapshot, show a conflict indicator ("This
image was edited by X since you started browsing. Review changes?").
This is the standard optimistic concurrency pattern.

### Forced PIT refresh — belt and suspenders

> **5 minutes vs 10 minutes — two independent clocks:**
>
> - **5 min** = ES idle timeout. ES garbage-collects the PIT if no request
>   uses it for 5 consecutive minutes. Every `search_after` request resets
>   this timer (we pass `keep_alive: "5m"` with each request). So as long
>   as the user is scrolling — even slowly — the PIT stays alive. It only
>   expires if the user walks away for 5+ minutes.
>
> - **10 min** = our freshness timer. Even if the user is actively
>   scrolling (keeping the PIT alive via the 5m timer), the data under
>   the PIT gets staler over time. We swap the PIT for a fresh one every
>   10 minutes to bound the maximum age of the data.
>
> These are independent: the 5m timer prevents resource leaks in ES; the
> 10m timer prevents stale data for active users.

PIT refresh points that don't disrupt the user's session:

| Trigger | Action | Disruption |
|---|---|---|
| "N new images" ticker clicked | New search → fresh PIT | Expected (user asked for it) |
| Sort change | New search → fresh PIT | Expected (result set reorders) |
| Filter change | New search → fresh PIT | Expected |
| 10 minutes since last PIT opened (user still active) | Background: close old PIT, open new PIT, re-fetch current buffer window | **Zero** — buffer contents may shift slightly if data changed, but position preserved. Transparent to user. |
| 5 minutes idle (ES expires PIT) | On next scroll: open new PIT, refetch current position | **Zero** — user was idle, brief re-fetch on resumption |
| Return from image detail after editing (Phase 4) | Refresh PIT + re-fetch visible buffer | Expected (user just made changes) |

The **10-minute background refresh** is the key safety valve. It bounds
the maximum staleness to 10 minutes regardless of browse duration. It
doesn't disrupt scroll position or focus — it just silently swaps the PIT
and re-fetches the ~1000 buffer entries. If data hasn't changed, the user
sees nothing. If data has changed, the buffer updates in place.

This is strictly better than kahuna's accidental refresh cadence (which
depends on the user happening to navigate to an image and back).

### When does the PIT refresh? (Complete list)

| Event | PIT refreshed? | New data visible? |
|---|---|---|
| New search (query/filter/sort change) | ✅ Yes (new PIT) | ✅ Yes |
| Logo click | ✅ Yes | ✅ Yes |
| "N new" ticker click | ✅ Yes | ✅ Yes |
| Normal scroll (forward/backward extend) | ❌ No (uses existing PIT) | ❌ No (consistent pagination) |
| Scrubber seek | ❌ No (uses existing PIT) | ❌ No |
| Open image detail | ❌ No PIT change | Phase 3+: live fetch shows current data |
| 10-minute background timer | ✅ Yes (transparent swap) | ✅ Yes (buffer re-fetched) |
| PIT expired (5 min idle) | ✅ Yes (re-open on next scroll) | ✅ Yes |

### Is this a regression from current kupua?

**No.** Current kupua (without PIT) has its own staleness:
- `frozenUntil` hides new uploads — same as PIT.
- Edits and deletes *do* show through (live index) — but they can also
  cause page-boundary duplicates and gaps. PIT trades "sometimes stale
  edits" for "always consistent pagination."
- Current kupua has no background refresh — the freeze lasts until the
  next manual search. PIT with the 10-minute timer is *fresher* than
  today's `frozenUntil` for long sessions.

### PIT expiry (ES idle timeout = 5 minutes)

PIT keepalive is set to 5 minutes. Every `search_after` request includes
`keep_alive: "5m"`, which resets the timer. So the PIT stays alive as
long as the user is scrolling (even slowly — one request per several
seconds is enough).

The PIT only expires if the user goes **completely idle** (no scroll, no
interaction) for 5+ continuous minutes. When that happens:

1. User scrolls after the idle period.
2. `search_after` returns a 404 (PIT not found).
3. Kupua catches the 404, silently opens a new PIT, refetches the current
   buffer position.
4. The user sees a brief loading flash (maybe — the re-fetch is fast).
   Data may be slightly different (the index moved during idle).
5. No error state. Transparent recovery.

This is **not** the same as the 10-minute freshness timer. Both can
trigger independently:

| Scenario | 5m idle timer | 10m freshness timer |
|---|---|---|
| User scrolls continuously for 15 min | Never fires (scroll resets it) | Fires at 10m — background swap |
| User scrolls for 3 min, idles for 6 min, scrolls again | Fires at 8m (5m idle after 3m activity) — re-open on scroll | Doesn't fire (only 9m total, and PIT was already refreshed at 8m) |
| User idles for 12 min | Fires at 5m (PIT GC'd) | Would fire at 10m but PIT already gone — both result in fresh PIT on next interaction |

### PIT size and infrastructure impact

**PIT does NOT duplicate the index.** This is the most common
misconception. Here's what PIT actually costs:

ES uses an immutable **segment-based architecture** (from Lucene). The
index is a collection of segment files on disk. When documents are added,
edited, or deleted, ES writes new segments and eventually merges old ones
(the merge process garbage-collects superseded segments).

Opening a PIT says to ES: **"don't delete the segments I can currently
see."** That's it. It holds a reference on existing segment files —
preventing them from being GC'd during merge. It copies nothing.

**Cost breakdown:**

| Resource | PIT cost | Scale |
|---|---|---|
| **Disk** | Old segments that would have been merged stay on disk until PIT closes | Proportional to index churn during the PIT window. For a 9M-doc index with ~60k new images/day, a 10-minute PIT window ≈ ~400 new images ≈ a few MB of extra old segments. Negligible vs. the total index size (multi-GB). |
| **Memory** | Segment reader holds open file handles (one per segment, ~a few KB each) | A 9M-doc index might have 20–50 segments. One PIT ≈ 20–50 open file handles ≈ kilobytes. |
| **CPU** | Zero additional cost | PIT is just a reference. No computation. |
| **Per-PIT overhead** | One "search context" tracked by ES | ES default `max_open_pit_contexts`: **100** per node. 40 users = 40 PITs = well within limit. |

**Worst case:** A bulk reindex runs while 40 PITs are open. The old
segments can't be cleaned up until all PITs close. Disk usage temporarily
spikes (old + new segments coexist). This is bounded by the PIT keepalive
— 5 minutes after the reindex, idle PITs expire and segments are freed.
Active PITs refresh every 10 minutes. Maximum extra disk: one full index
copy for ~10 minutes. This is a rare operational event, not normal usage.

**Monitoring (if you want to check):**

```bash
# Check open PIT contexts on TEST cluster (via tunnel)
curl -s 'http://localhost:9200/_nodes/stats/indices/search' | \
  jq '.nodes[].indices.search.open_contexts'

# Check current index size
curl -s 'http://localhost:9200/_cat/indices/images*?v&h=index,store.size'
```

### Do you need to check infra?

**For TEST (what you're running now): No.** TEST is a development
cluster. One user with one PIT is invisible. The PIT adds zero measurable
load.

**For PROD (future, 40 users): Probably not, but worth a 5-minute check.**
The only setting that matters is `max_open_pit_contexts` (default 100).
With 40 concurrent users, each with 1 PIT, we use 40 of 100. Comfortable.
If Grid ever grows to 80+ concurrent kupua users, bump the setting.
Everything else (disk, memory, CPU) is negligible — PIT is lighter than
a `scroll` context, and ES was designed for this.

**Nothing else in this plan requires infrastructure changes.** All other
operations (`search_after`, `_count`, `_search`) are standard read queries
that kupua already sends. The query volume doesn't change — `search_after`
replaces `from/size`, not adds to it.

### PIT count: one per user, not one per search

To be explicit: each kupua browser tab opens **one** PIT at a time. A new
search closes the old PIT and opens a new one. 40 concurrent users = 40
PITs. Not 40 × (searches per session). The PIT lifecycle is:

```
User opens kupua       → no PIT yet
User searches          → open PIT #1
User scrolls           → reuse PIT #1 (keepalive extended)
User searches again    → close PIT #1, open PIT #2
User closes tab        → PIT #2 expires after 5m idle (or we close on unload)
```

### PIT and Grid's index migration

Grid has an index migration feature (`ThrallMigrationClient`) that
re-indexes the entire image collection from one physical ES index to
another. Understanding whether PIT interacts with this is important.

**How migration works (from the Grid source):**

1. **Start:** Thrall creates a new empty index and assigns the
   `Images_Migration` alias to it.

2. **Scroll + reindex:** Thrall uses the ES `scroll` API (5-minute
   keepalive, batches of 100) to iterate through all images in the
   current index (`imagesCurrentAlias`). For each image, it sends a
   Kinesis message that triggers `directInsert` into the migration index.
   Each migrated image gets an `esInfo.migration.migratedTo` marker on
   the current index.

3. **During migration:** The `media-api` queries BOTH indexes
   simultaneously (`List(imagesCurrentAlias, running.migrationIndexName)`)
   with a filter excluding already-migrated docs from the current index.
   This ensures users see each image exactly once (either from the current
   index if not yet migrated, or from the migration index if already
   migrated).

4. **Completion:** Thrall atomically swaps the `imagesCurrentAlias` alias
   from the old physical index to the new one. The old index gets a
   historical alias.

**How PIT interacts with this:**

Kupua opens a PIT on the ES index that `images` (the current alias)
resolves to. PIT binds to the **physical index**, not the alias. So:

| Migration phase | PIT behaviour | Impact on kupua |
|---|---|---|
| **Before migration** | PIT on current index | Normal — no interaction |
| **During migration** | PIT on current index. New docs being inserted into migration index are invisible (PIT is on a different index). `esInfo.migration.migratedTo` markers appear but kupua doesn't filter on that field. | **No impact.** Kupua sees the same data it saw when PIT was opened. The migration writes to a different index. |
| **Alias swap (completion)** | `images` now points to the NEW index. But the PIT still references the OLD index. | **Stale PIT.** `search_after` with the old PIT still works (ES honours PITs on physical indexes even after alias change), but returns data from the old index. |
| **After PIT refresh** | Next PIT opens on the NEW index (via the alias). | **Normal.** Fresh data from the new index. |

**The critical moment is the alias swap.** An active kupua session with
an open PIT would continue browsing the OLD index until the PIT refreshes.
The 10-minute freshness timer handles this — within 10 minutes of the
swap, all active sessions get a fresh PIT on the new index. Users who
re-search (new query, logo click, etc.) get a fresh PIT immediately.

**Is this a problem?**

**No.** Migrations are rare operational events (a few times per year at
most). They take hours to complete. The alias swap is a single atomic
moment. A kupua user browsing during the swap sees consistent data from
the old index for at most 10 minutes — then transparently switches to the
new index. They'd never notice. This is strictly better than kahuna, which
queries both indexes simultaneously during migration (more complex, and
the dual-index query adds latency).

**One edge case worth noting:** During migration, kupua only sees the
current index (it doesn't know about the migration index). If a user
searches during migration, they might see slightly stale data for images
that have already been migrated to the new index (since the migration
process writes to the new index, not updates the current one). This is
the same as kahuna's behaviour for users who don't have the dual-index
search — and kupua doesn't have it because it queries ES directly, not
via media-api. When kupua moves to the Grid API data source (Phase 3),
it would inherit the migration-aware dual-index search for free.

**Action needed: none.** No code changes, no special handling. The
existing PIT refresh mechanism (10-minute timer + refresh on new search)
handles the alias swap gracefully. Document this in deviations.md since
kupua doesn't do the dual-index query that media-api does during
migration.

### Decision: PIT is worth it

**With the freshness strategy above**, PIT gives us:
- ✅ Consistent deep pagination (the whole point)
- ✅ No page-boundary duplicates or gaps
- ✅ Bounded staleness (max 10 minutes, vs unbounded `frozenUntil` today)
- ✅ Path to live-fetch metadata in Phase 3 (detail panel always fresh)
- ✅ Path to optimistic concurrency in Phase 4 (safe multi-user editing)

**Without PIT**, we'd need to solve page-boundary consistency ourselves
(kahuna never solved it — just accepted duplicates). And `search_after`
without PIT is unreliable at scale (the ES docs recommend PIT for any
non-trivial `search_after` usage).

**If PIT proves problematic on the cluster** (unlikely — it's a lightweight
mechanism), we can fall back to `search_after` without PIT + `frozenUntil`
for upload-time stability only. The buffer architecture doesn't depend on
PIT — only the pagination consistency does.

---

## Architecture Design — The Windowed Buffer

### Core concept

Replace the unbounded sparse `results[]` array with a **fixed-capacity
dense buffer** plus a `bufferOffset` that maps `buffer[0]` to a global
position in the result set.

```
Global result set (9M images, sorted):
[0] [1] [2] ... [499,999] [500,000] ... [500,999] ... [8,999,999]
                           ^^^^^^^^^^^^^^^^^^^^^^^^
                           Buffer window (1000 items)
                           bufferOffset = 500,000
```

### Buffer state

```typescript
interface BufferState {
  /** Dense array of loaded images. Fixed capacity (e.g. 1000). */
  buffer: (Image | undefined)[];
  /** Global offset of buffer[0]. */
  bufferOffset: number;
  /** Total matching images in the result set. */
  total: number;
  /** PIT ID for consistent pagination (null when using local ES). */
  pitId: string | null;
  /** Cursor for the start of the buffer (for backward fetch). */
  startCursor: SortValues | null;
  /** Cursor for the end of the buffer (for forward fetch). */
  endCursor: SortValues | null;
  /** Sort clause (with tiebreaker) currently in use. */
  sortClause: SortClause[];
}

type SortValues = (string | number | null)[];
```

### Buffer operations

| Operation | When | How |
|---|---|---|
| **Initial search** | New query/sort/filter | Clear buffer. ES search with `size: BUFFER_CAP/2`. Fill buffer starting at [0]. Store end cursor. Open PIT. |
| **Forward extend** | Scroll nears buffer end | `search_after` using `endCursor`. Append to buffer. If buffer exceeds capacity, evict from start. Update `bufferOffset`. Store new end cursor. |
| **Backward extend** | Scroll nears buffer start | Reverse-sort `search_after` using `startCursor`. Prepend to buffer (reversed). If buffer exceeds capacity, evict from end. Store new start cursor. |
| **Seek** | Scrubber drag, sort-around-focus | Clear buffer. Estimate target sort values from global offset. `search_after` with estimated values. Refill buffer at target. Update `bufferOffset` and cursors. |
| **Eviction** | Buffer exceeds capacity | Drop entries from the far end (relative to scroll direction). Update cursors and `bufferOffset`. |

### Buffer capacity

**1000 entries** is the target. Rationale:

- At 5–10KB per image object: 5–10MB. Comfortable for any device.
- At 32px/row (table): 1000 rows = 32,000px. Well within browser limits.
- At 303px/row (grid, 5 columns): 200 visual rows = 60,600px. Fine.
- Provides ~10 screens of overscan at typical viewport heights.
- Large enough that moderate scroll speeds never see placeholders.

The buffer can contain gaps (undefined slots) during loading, same as
today's sparse array — the gap detection logic in `useDataWindow` doesn't
change.

### virtualizer count

Today: `virtualizerCount = min(total, 100_000)`.

With the windowed buffer: `virtualizerCount = buffer.length` (dense, ~1000).
The virtualizer no longer represents the global position — only the buffer
window. The scrubber (not the native scrollbar) represents global position.

**But wait** — native scroll still works within the buffer. The user scrolls
normally through ~1000 rows. When they approach the buffer edge, more data
loads (forward/backward extend). From the user's perspective, this feels
like infinite scroll — they never see the buffer boundary.

The scrubber is for **big jumps** — dragging to a distant position clears
the buffer and refills at the target. Normal scrolling stays smooth.

### Transition from current architecture

The key insight: **`useDataWindow`'s public API barely changes**.

| API | Current | After |
|---|---|---|
| `getImage(index)` | `results[index]` | `buffer[index - bufferOffset]` (if in window) |
| `findImageIndex(id)` | `imagePositions.get(id)` | Same — positions are now global offsets |
| `reportVisibleRange(start, end)` | Gap detection → `loadRange(from, size)` | Gap detection → `extendForward/Backward` or `seek` |
| `virtualizerCount` | `min(total, 100k)` | `buffer.length` (or `bufferCapacity`) |
| `total` | From ES | Same |
| `loadMore()` | Append next page | **Removed** — replaced by forward extend |
| `loadRange(start, end)` | `from/size` at arbitrary offset | **Removed** — replaced by buffer extend/seek |

**Views (ImageTable, ImageGrid, ImageDetail) need minimal changes.** They
consume `useDataWindow` — as long as the hook's output shape stays the same,
views don't care whether the data came from `from/size` or `search_after`.

The biggest view change: **index mapping**. Today, virtual row index =
global result index. After, virtual row index = buffer-local index.
Views that use `virtualItems[i].index` to look up images need to add
`bufferOffset`. This is a ~5-line change per view.

### imagePositions Map — stays global

`imagePositions: Map<imageId, globalIndex>` stays as-is. When the buffer
slides, positions for evicted images are removed. When new images load,
new positions are added. The Map is the mechanism for "Never Lost" — it
answers "where is image X in the global result set?" regardless of
whether that image is currently in the buffer.

**Important:** Positions for images *not in the buffer* can become stale
if the index changes. PIT mitigates this (snapshot view) but PIT expires.
After PIT expiry, positions are best-effort. This is acceptable — kahuna
doesn't even try.

---

## The Scrubber — UI for Position Control

### Minimum viable scrubber (Phase 2)

A vertical track on the right edge of the content area:

```
┌─────────────────────────────────┬──┐
│                                 │▓▓│ ← thumb (proportional height)
│         Content area            │  │
│    (table / grid / detail)      │  │
│                                 │  │
│                                 │  │
│                                 │  │
│                                 │  │
└─────────────────────────────────┴──┘
```

- **Thumb position** = `(bufferOffset + visibleStart) / total`
- **Thumb height** = `visibleCount / total` (proportional, min 20px)
- **Click track** → seek to that position
- **Drag thumb** → continuous seek (debounced, ~200ms)
- **Scroll wheel on scrubber** → same as content scroll

### Labels (Phase 2+)

While dragging, a floating label appears beside the thumb showing the
value at that position:

- **Date sorts:** "14 Mar 2024"
- **Keyword sorts (credit, source, etc.):** "Getty Images" or just "G"
- **Numeric sorts:** "4032 × 3024"

The label value comes from the distribution data (histogram/terms agg
cached on first search).

### Track markers (Phase 6)

For date sorts: subtle year labels along the track.
For keyword sorts: first-letter markers (A B C D…) like a phone contacts
sidebar.

These require the distribution data to be pre-computed and mapped to
track positions. Not MVP.

### Interaction with native scroll

The scrubber and native scrollbar coexist but serve different purposes:

- **Native scrollbar** controls position within the buffer window (~1000 rows).
  It works normally — TanStack Virtual manages it.
- **Scrubber** controls global position in the 9M result set.
  Dragging it is a *seek* — the buffer is repositioned.

When the user scrolls normally and the buffer extends, the scrubber thumb
updates smoothly to reflect the new global position. No conflict.

When the user drags the scrubber, the content jumps to the new position.
The native scrollbar resets to the top of the new buffer window.

### Should the native scrollbar be hidden?

**No, not in Phase 2.** The native scrollbar provides familiar physics
(momentum, inertia, track click) within the buffer. Hiding it would
require reimplementing all of that. The scrubber is *additional* control,
not a replacement.

In Phase 6, we may consider hiding the native scrollbar and making the
scrubber the sole control — but only if we can replicate the physics.
This is strictly optional polish.

---

## Never Lost — Sort-Around-Focus

> **Independence note:** Sort-around-focus (step 11) depends on steps 1–9
> (tiebreaker sort, `search_after`, windowed buffer, seek) but does NOT
> block any of them. Steps 1–10 (including the scrubber) deliver full
> value without sort-around-focus. If step 11 proves harder than expected,
> the rest still ships.

> **The 100k wall is gone.** The previous attempt (see performance-analysis.md
> #2) failed because it used `from/size` to seek to the found position.
> `_count` itself has no depth cap — it returns the exact count regardless
> of result set size. With `search_after` + seek (step 6), we can navigate
> to any position the count query returns. The wall was in the *seeking*,
> not the *counting*.

### The problem

User is looking at image X (focused). They click a column header to re-sort.
The result set reorders. Where is image X now? Three scenarios:

1. **Image X is within the first page** — it lands in the initial buffer.
   Find and focus it. Done.

2. **Image X is at position > first page but ≤ 100k** — we can find its
   position via `_count` and jump with `from/size`. Focus it.

3. **Image X is at position > 100k** — we need `search_after` to get there.
   Find its position via `_count`, then seek via sort-value estimation.

### The algorithm

After a sort change:

```
1. Run the new search (first page, new sort order). Show results immediately.
2. In parallel: find focused image's new position:
   a. Get image X's sort values for the new sort order:
      - If image X is in the buffer, read sort values from the response's
        `sort` array.
      - If not (evicted), fetch image X by ID, extract the sort field value.
   b. _count query: "how many docs have (sortValue < X.sortValue) OR
      (sortValue == X.sortValue AND _id < X._id)?"
      This gives the exact global offset.
   c. If offset is within the buffer → focus + scroll to it. Done.
   d. If offset is outside the buffer → seek to offset, then focus.
3. Animate: show a brief indicator ("Finding image…") while the async
   lookup runs. Don't block the UI — the user sees fresh sorted results
   immediately at position 0. When the lookup completes, smooth-scroll
   or seek to the found position.
```

### The count query

For a sort on `uploadTime DESC` with tiebreaker `_id ASC`, finding the
position of image X with `uploadTime = T` and `_id = I`:

```json
{
  "query": {
    "bool": {
      "should": [
        { "range": { "uploadTime": { "gt": T } } },
        {
          "bool": {
            "must": [
              { "range": { "uploadTime": { "gte": T, "lte": T } } },
              { "range": { "_id": { "lt": I } } }
            ]
          }
        }
      ],
      "minimum_should_match": 1,
      "filter": [ ...same filters as current search... ]
    }
  }
}
```

The count of matching docs = the global 0-based offset of image X.

**Limitation:** `_id` is not a sortable field in all contexts. In ES 8.x,
`_id` can be used in sort clauses and range queries, but it's a keyword
field — range comparison is lexicographic, not numeric. This is fine as
long as we use the same `_id` type consistently in both the sort tiebreaker
and the count query. Grid's image IDs are random-looking strings
(e.g. `abc123def456`) — lexicographic ordering is deterministic.

### Performance of the count query

`_count` is lightweight — it scores but doesn't fetch docs. Against 9M
docs with a simple range filter, it should complete in 10–50ms. The
tiebreaker adds a second range clause, slightly more complex but still
fast (both fields are indexed).

If the focused image's sort value is very common (e.g. 10,000 images with
`credit: "Getty Images"`), the `OR (equal AND _id < X)` branch scans
more docs but is still bounded by the sort-value cardinality. This is
acceptable.

---

## Safeguards & Risk

### ES cluster impact

| Operation | Impact | Frequency | Risk |
|---|---|---|---|
| `_pit` (open) | Holds old segments in memory | Once per search session | Very low — PIT is lightweight |
| `_pit` (close) | Releases segments | Once per search change | None |
| `search_after` | Same cost as `from/size` with `size:N` | Per buffer extend (~every few seconds during scroll) | Same as today |
| `_count` (sort-around) | Lightweight count query | Once per sort change | Very low |
| Histogram agg | Single agg query | Once per search | Low — cached |

**Net cluster load change: approximately zero.** `search_after` replaces
`from/size` — same query load, same `size` parameter, same frequency.
PIT is lighter than the `scroll` API it replaced. The histogram agg is
a single additional query per search (cacheable).

### Safeguard changes needed

1. **`ALLOWED_ES_PATHS`** — add `_pit` (open + close are both POST/DELETE
   to `_pit`, but they're read-only operations — no data is mutated).

2. **Proxy routing** — PIT-based searches go to `/_search` (no index
   prefix) because the PIT already binds to the index. The Vite proxy
   currently routes `/es/*` → ES. This works if we use `/es/_search`
   directly. Need to ensure the `esRequest` method can send requests
   without the index prefix when a PIT ID is present.

3. **PIT keepalive** — set to 5 minutes. Each `search_after` request
   extends the keepalive (pass `keep_alive: "5m"` with each search).
   If the user is idle for >5 minutes, the PIT expires. Next scroll
   action opens a new PIT. Clean degradation — no error, just a brief
   re-fetch.

4. **PIT cleanup on search change** — when a new search starts (query,
   sort, filter change), close the old PIT (fire-and-forget DELETE) and
   open a new one. Stale PITs don't hold segments forever — they expire
   on their own.

### What PIT does NOT protect against

- **Local ES doesn't need PIT.** The 10k-doc local dataset is stable.
  PIT is only useful against live clusters where the index changes.
  Make PIT optional — skip on local ES.

- **PIT doesn't help with sort-value estimation.** The histogram for
  scrubber mapping is computed against the live index (or the PIT if
  we include it in the agg request). The histogram is approximate —
  small inaccuracies in scrubber position are acceptable.

---

## What We Explicitly Won't Do

1. **No custom scroll physics.** The native scrollbar stays for buffer-
   local scrolling. We don't reimplement momentum, inertia, or track
   clicks. The scrubber is a separate, additional control.

2. **No non-linear scrubber mapping in Phase 2.** The scrubber is linear
   (position = offset / total). Non-linear mapping (distribution-aware)
   is Phase 6 polish.

3. **No infinite PIT keepalive.** PITs expire after 5 minutes of
   inactivity. We don't try to keep them alive forever — graceful
   re-open on expiry is simpler and safer.

4. **No server-side caching of scrubber positions.** All state is
   client-side (buffer, cursors, PIT ID). Nothing new is stored on the
   ES cluster beyond the PIT snapshot.

5. **No `scroll` API.** We use `search_after` + PIT, not the deprecated
   `scroll` context.

6. **No sort-around-focus for text-analysed fields.** Fields like Title
   and Description are not sortable (no `.keyword` sub-field). If
   someone sorts by a non-sortable field... they can't, so this case
   doesn't arise.

7. **No column reordering.** That's a separate, independent work item.
   Nothing in this plan depends on it or conflicts with it.

---

## Browser & W3C Technologies — What Can Help

Survey of browser-level technologies (current and emerging) that are
relevant to virtual scroll, large datasets, and the scrubber. Some are
usable now; others are future potentials worth tracking.

### Usable now — consider for this implementation

#### `content-visibility: auto` + `contain-intrinsic-size`

CSS property that tells the browser to skip rendering of off-screen
content entirely (no layout, no paint, no style). The browser still
reserves space via `contain-intrinsic-size`. Shipped in Chrome 85+,
Firefox 124+, Safari 18+.

**For us:** TanStack Virtual already manages DOM recycling (only ~60 rows
exist). But `content-visibility: auto` could be a belt-and-suspenders
layer on the buffer rows *outside* the virtualizer's visible window:
rows that are in the buffer and in the DOM but scrolled off-screen would
get zero rendering cost. Particularly relevant for the grid view where
cells contain `<img>` elements (the browser can skip decode/paint for
off-screen images).

**Verdict:** Worth adding as a single CSS line on scroll container children.
Zero-downside progressive enhancement. Won't change architecture, but
shaves rendering cost.

#### `requestIdleCallback`

Runs a callback during browser idle periods (between frames, when the
user isn't interacting). Chrome 47+, Firefox 55+, Safari 16.4+.

**For us:** Buffer eviction, `imagePositions` cleanup, and PIT background
refresh are all non-urgent work that shouldn't compete with scroll
rendering. Wrapping these in `requestIdleCallback` prevents eviction
jank during fast scroll.

**Verdict:** Use for eviction and background PIT refresh. Small code
change, measurable smoothness improvement during heavy scroll + eviction.

**Implementation note (March 2026):** Not adopted. Buffer eviction runs
synchronously inside `extendForward`/`extendBackward` `set()` calls.
At `BUFFER_CAPACITY = 1000`, eviction is O(evicted entries) ~200 items,
completing in <1ms. No jank observed. Worth revisiting only if buffer
capacity increases significantly or if eviction logic grows more complex.

#### `ResizeObserver` (already using)

Already used for grid column recomputation and scroll anchoring. No
changes needed. Mentioned for completeness.

### Usable now — consider for scrubber polish (Phase 2+)

#### CSS `anchor()` positioning

Chrome 125+, not yet in Firefox/Safari. Allows one element to anchor its
position to another element without JS.

**For us:** Scrubber labels could anchor to the thumb element, eliminating
the JS position calculation during drag. Falls back gracefully (JS
positioning works everywhere).

**Verdict:** Nice-to-have for scrubber labels. Progressive enhancement.
Not worth building around — JS fallback is trivial.

#### Scroll Timeline API (`animation-timeline: scroll()`)

Chrome 115+, Firefox behind flag. Links CSS animations directly to
scroll position without JS listeners.

**For us:** Could drive the scrubber thumb's visual position purely in CSS
(no JS scroll event → no main thread involvement → buttery smooth). The
thumb `translateY` would be a scroll-linked animation.

**Catch:** This only works for native scroll → visual output. Our scrubber
tracks *logical position* (`bufferOffset + scrollOffset`), not just
`scrollTop`. The mapping requires JS. But within the buffer window (where
native scroll works), the Scroll Timeline API could make the thumb track
scroll position with zero JS, and JS would only update during seeks (when
`bufferOffset` changes).

**Verdict:** Future potential. Track this API. When Firefox ships it, it
could make the scrubber feel native-scrollbar-smooth.

### Future potentials — not ready yet, worth tracking

#### View Transitions API

Chrome 111+, Safari 18+, Firefox 128+. Provides a framework for animated
transitions between DOM states via `document.startViewTransition()`.

**For us:**
- **Density switches** (table ↔ grid) could cross-fade instead of hard-cut.
  The API captures the old state as a screenshot, applies the new DOM,
  then animates between them.
- **Scrubber seek transitions** — when the buffer is replaced after a big
  seek, the content could cross-fade rather than flash to skeleton → data.
- **Sort-around-focus** — the focused image could visually "travel" to its
  new position after a sort change.

**Catch:** Cross-origin restrictions on `<img>` elements may prevent the
screenshot capture if thumbnails are from a different origin (S3 proxy).
Needs testing.

**Verdict:** Exciting long-term potential. Don't build around it yet — the
API is young and the cross-origin issue may bite. But when density slider
work starts (Phase 6), this should be the first thing to try.

#### `scheduler.postTask()` / `scheduler.yield()`

Chrome 94+. Lets code explicitly yield to the browser's rendering pipeline
and schedule work at different priorities (`user-blocking`, `user-visible`,
`background`).

**For us:** During a scrubber seek, the data fetch is `user-blocking` (show
results ASAP), but buffer eviction is `background` (clean up later). React
19's concurrent features partially handle this (transitions, deferred
values), but `scheduler.postTask` would give finer control outside React's
tree.

**Verdict:** Monitor. React 19 covers most cases. If profiling shows
main-thread contention during seeks, this could help.

#### `ContentVisibilityAutoStateChange` event

Chrome 108+. Fires when `content-visibility: auto` toggles an element
between rendered and skipped.

**For us:** Could be an alternative signal for gap detection — instead of
computing visible ranges from scroll position, let the browser tell us
which rows just became visible. Simpler and potentially more accurate.

**Catch:** Only works with `content-visibility: auto`, which we'd need to
add first. And TanStack Virtual's gap detection is already accurate and
proven. Replacing it with a browser event is high risk for low gain.

**Verdict:** Interesting research direction. Not for this implementation.

#### Prerender / Speculation Rules API

Chrome 109+. Allows pre-rendering of future navigations.

**Not applicable.** Kupua's image detail is an overlay, not a navigation.
Prefetching (which we already do) is the correct mechanism.

### Summary table

| Technology | Status | Usefulness | When | Adopted? |
|---|---|---|---|---|
| `content-visibility: auto` | ✅ Shipped | Medium — belt-and-suspenders rendering skip | Step 9 (view changes) | ❌ Not yet — TanStack Virtual handles row recycling; low incremental value |
| `requestIdleCallback` | ✅ Shipped | Medium — non-urgent eviction/cleanup | Step 7 (eviction) | ❌ Not yet — eviction runs synchronously inside `set()` (fast at 1000 entries); worth revisiting if buffer grows |
| CSS `anchor()` | ⚠️ Chrome only | Low — scrubber label positioning | Step 12+ (labels) | ❌ Not yet — JS positioning is trivial |
| Scroll Timeline API | ⚠️ Chrome, FF flag | High — scrubber thumb smoothness | Phase 6 polish | ❌ Not yet — scrubber uses direct DOM writes during drag (60fps); Scroll Timeline would help for within-buffer scroll tracking only |
| View Transitions API | ⚠️ Partial | High — density switch + seek animation | Phase 6 density slider | ❌ Not yet — good candidate for seek cross-fade and density switch |
| `scheduler.postTask` | ⚠️ Chrome only | Low — priority scheduling | If contention observed | ❌ Not yet — no contention observed |
| `ContentVisibilityAutoStateChange` | ⚠️ Chrome only | Low — alt gap detection | Research only | ❌ N/A — `reportVisibleRange` from scroll events replaced gap detection entirely |
| Speculation Rules | ✅ Shipped | None — wrong model | N/A | ❌ N/A |

**Note (March 2026 audit):** The two highest-value technologies — `content-visibility: auto`
and `requestIdleCallback` — remain unadopted but their urgency has decreased. Buffer eviction
at 1000 entries is O(1) time (no GC pressure), and TanStack Virtual's row recycling makes
`content-visibility` redundant for the current view architecture. The highest-value future
adoption is **View Transitions API** for density-switch and seek animations (Phase 6).

---

## Dependencies & Ordering

### External dependencies

- **Elasticsearch 8.x** — `search_after` + PIT available since ES 7.10.
  Grid runs ES 8.18.3. ✅ No upgrade needed.

- **`max_result_window`** — currently 101,000 on PROD. For `from/size`
  random jumps within 100k, this is sufficient. For `search_after`,
  the setting is irrelevant (no depth limit). ✅ No change needed.

- **No Grid backend changes.** Everything is client-side (kupua) +
  standard ES APIs. No Scala, no media-api, no deployment.

### Internal dependencies

```
[1] Tiebreaker sort ──────────────────────────┐
                                               │
[2] search_after in ES adapter ────────────────┤
                                               │
[3] PIT lifecycle management ──────────────────┤
                                               ▼
[4] Windowed buffer (replace results[]) ───────┤
                                               │
[5] Buffer extend (forward/backward) ──────────┤
                                               │
[6] Seek (clear + refetch at offset) ──────────┤
                                               │
[7] Page eviction ─────────────────────────────┤
                                               ▼
[8] useDataWindow adaptation ──────────────────┤
                                               │
[9] View changes (index mapping) ──────────────┤
                                               ▼
[10] Basic scrubber UI ────────────────────────┤
                                               │
[11] Sort-around-focus ────────────────────────┘
                                               │
                                               ▼
                                    [12] Scrubber labels (Phase 2+)
                                    [13] Non-linear mapping (Phase 6)
```

### What can be done incrementally

Steps 1–3 can be implemented and tested in isolation (new DAL methods,
no UI change). Step 4 is the big internal refactor. Steps 5–9 follow
naturally. Step 10 is UI-only. Step 11 requires all of 1–9.

---

## Implementation Plan — Phased Work Breakdown

### Step 1: Tiebreaker sort (~30 min)

**What:** Append `{ "_id": "asc" }` to all sort clauses in `buildSortClause()`.

**Where:** `es-adapter.ts`

**Details:**
- After building the sort array from `orderBy`, push `{ _id: "asc" }` as
  the final element.
- All search responses now include `_id` in the `sort` array.
- Store the `sort` array from each hit (currently discarded) — needed for
  `search_after` cursors.

**Risk:** None. The tiebreaker is transparent to the UI. Sort order is
unchanged for users (ties broken by ID instead of being arbitrary).

**Test:** Existing sort behaviour unchanged. Verify `sort` array in response
includes `_id`.

### Step 2: Store sort values from ES responses (~30 min)

**What:** Preserve the `sort` array from each ES hit alongside the `_source`.

**Where:** `es-adapter.ts`, `types.ts`, `search-store.ts`

**Details:**
- Extend `SearchResult` or introduce a wrapper that carries both `_source`
  (the Image) and `sort` (the sort values).
- The search store needs sort values for the first and last items in the
  buffer (for cursor management). Two options:
  1. Store `sort` for every item (simple, ~100 bytes per item × 1000 = 100KB).
  2. Store `sort` only for boundary items (complex, saves memory).
  Option 1 is simpler and the memory cost is negligible. Go with it.
- Extend `Image` type or create a `BufferEntry = { image: Image, sort: SortValues }` wrapper.

**Risk:** Very low. Additive change — nothing breaks.

### Step 3: search_after + PIT in ES adapter (~2–3 hours)

**What:** Add `searchAfter()` method to `ElasticsearchDataSource` and
`ImageDataSource` interface. Add PIT lifecycle methods.

**Where:** `es-adapter.ts`, `types.ts`

**New DAL methods:**

```typescript
interface ImageDataSource {
  // ...existing methods...

  /** Open a Point In Time snapshot. Returns the PIT ID. */
  openPit(keepAlive?: string): Promise<string>;

  /** Close a PIT. Fire-and-forget. */
  closePit(pitId: string): Promise<void>;

  /**
   * Fetch a page using search_after cursor.
   * If pitId is provided, uses PIT for consistency.
   * Returns hits + sort values for cursor management.
   */
  searchAfter(
    params: SearchParams,
    searchAfterValues: SortValues | null,
    pitId?: string,
    signal?: AbortSignal,
  ): Promise<SearchAfterResult>;

  /**
   * Count documents before a given sort position.
   * Used for sort-around-focus ("where is image X now?").
   */
  countBefore(
    params: SearchParams,
    sortValues: SortValues,
    sortClause: SortClause[],
  ): Promise<number>;
}
```

**Safeguard changes:**
- Add `_pit` to `ALLOWED_ES_PATHS`.
- Add `esRequestRaw(path, body, signal)` that sends to `ES_BASE/path`
  (no index prefix) — used for PIT-based searches.

**PIT lifecycle:**
- Open: `POST /${ES_INDEX}/_pit?keep_alive=5m`
- Each search: include `pit: { id, keep_alive: "5m" }` and send to
  `/_search` (no index prefix)
- Close: `DELETE /_pit` with body `{ id }` — fire-and-forget

**Test locally:** PIT works on local docker ES too (just less useful).
Verify open/search/close cycle. Verify `search_after` returns correct
pages.

### Step 4: Windowed buffer in search store (~4–6 hours)

**What:** Replace the unbounded `results: Image[]` with a fixed-capacity
windowed buffer. This is the core architectural change.

**Where:** `search-store.ts` (major refactor)

**New state:**

```typescript
interface SearchState {
  // Replace results: Image[] with:
  buffer: BufferEntry[];          // Dense, max ~1000 entries
  bufferOffset: number;           // buffer[0] maps to this global index
  total: number;
  pitId: string | null;
  startCursor: SortValues | null; // For backward extend
  endCursor: SortValues | null;   // For forward extend

  // Keep:
  imagePositions: Map<string, number>;  // Global positions (not buffer-local)
  focusedImageId: string | null;
  // ...other existing state
}
```

**New actions:**

```typescript
interface SearchState {
  search: () => Promise<void>;        // Clear buffer, open PIT, fetch first page
  extendForward: () => Promise<void>;  // search_after using endCursor
  extendBackward: () => Promise<void>; // Reverse search_after using startCursor
  seek: (globalOffset: number) => Promise<void>; // Clear + refetch at offset
  // Remove: loadMore, loadRange
}
```

**Migration strategy:**

This is the riskiest step. To mitigate:

1. Keep `loadMore`/`loadRange` working during development (feature-flagged).
2. Implement the new buffer alongside the old results array.
3. Switch `useDataWindow` to use the buffer when ready.
4. Remove old code once validated.

Or — since this is a personal project with no other contributors — just
do the swap directly and fix whatever breaks. The commit history preserves
the old code if needed.

### Step 5: Buffer extend (forward + backward) (~2–3 hours)

**What:** Implement forward and backward buffer extension using
`search_after`.

**Where:** `search-store.ts`

**Forward extend:**
```
When viewport nears buffer end (detected by useDataWindow):
1. searchAfter(params, endCursor, pitId)
2. Append results to buffer
3. Update endCursor to last hit's sort values
4. If buffer > capacity: evict from start, update bufferOffset + startCursor
```

**Backward extend:**
```
When viewport nears buffer start (and bufferOffset > 0):
1. Reverse the sort clause
2. searchAfter(reversedParams, startCursor, pitId)
3. Reverse the returned results
4. Prepend to buffer
5. Update startCursor to first hit's sort values
6. If buffer > capacity: evict from end, update endCursor
```

**Edge cases:**
- Buffer at position 0: no backward extend possible.
- Buffer at position `total - bufferSize`: no forward extend.
- PIT expired: re-open PIT, refetch current position. Transparent to user.
- Concurrent extends: use inflight tracking (like current `_inflight` Set).

### Step 6: Seek (~2–3 hours)

**What:** Implement buffer repositioning for scrubber drags and sort-
around-focus.

**Where:** `search-store.ts`

**Algorithm:**
```
seek(targetGlobalOffset):
1. Clear buffer
2. Estimate sort values for targetGlobalOffset:
   - If ≤100k: use from/size directly (simple, accurate)
   - If >100k: use histogram data to estimate sort values,
     then search_after with those values
3. Fill buffer centered on target (fetch targetOffset ± bufferCap/2)
4. Update bufferOffset, cursors
5. Set virtualizerCount = buffer.length
6. Scroll virtualizer to appropriate position within buffer
```

**For the initial implementation,** since most realistic filtered queries
return <100k results, `from/size` will handle the common case. The
histogram-based estimation for >100k is Phase 2+ polish.

### Step 7: Page eviction (~1–2 hours)

**What:** Evict buffer entries beyond the capacity limit.

**Where:** `search-store.ts` (within extend/seek actions)

**Strategy:** Evict from the far end relative to scroll direction.
Scrolling forward → evict from start. Scrolling backward → evict from end.

**What to clean up on eviction:**
- Remove evicted images from `imagePositions` Map.
- Update `bufferOffset` (if evicting from start).
- Update `startCursor` / `endCursor` to the new boundary values.
- Clear `_failedRanges` entries in the evicted region.

### Step 8: useDataWindow adaptation (~2–3 hours)

**What:** Update the hook to work with the windowed buffer instead of the
sparse results array.

**Where:** `useDataWindow.ts`

**Key changes:**
- `getImage(globalIndex)` → check if `globalIndex` is in
  `[bufferOffset, bufferOffset + buffer.length)`. If yes, return
  `buffer[globalIndex - bufferOffset]`. If no, return undefined (out of
  window).
- `virtualizerCount` → `buffer.length` (not `min(total, 100k)`).
- `reportVisibleRange(start, end)` → translate from virtualizer-local
  indices to global indices (add `bufferOffset`). Check if we're near
  buffer edges. Trigger `extendForward`/`extendBackward` instead of
  `loadRange`.
- Gap detection within the buffer stays the same (undefined slots while
  a fetch is in flight).
- `findImageIndex(id)` → unchanged (returns global index from
  `imagePositions`).

**New exports:**
- `bufferOffset: number` — views need this to translate between local and
  global indices.
- `globalPosition: number` — `bufferOffset + visibleStart` — for scrubber.
- `seek: (offset: number) => void` — exposed to scrubber.

### Step 9: View changes (~2–3 hours)

**What:** Update ImageTable, ImageGrid, ImageDetail to work with the
windowed buffer.

**Where:** `ImageTable.tsx`, `ImageGrid.tsx`, `ImageDetail.tsx`

**Changes:**
- Virtualizer `count` = `buffer.length` instead of `virtualizerCount`.
  (Or keep the name and change the value — less diff.)
- Row/cell index translation: `virtualItem.index` → buffer-local.
  `bufferOffset + virtualItem.index` → global. The image lookup uses
  buffer-local: `getImage(bufferOffset + virtualItem.index)`.
- Focus ring: `focusedImageId` is still an ID, not an index. No change.
- Scroll reset: on new search, scroll to top as today. On sort change
  with sort-around-focus, scroll to the focused item's new position.
- `StatusBar` image count: `[bufferOffset + visibleStart + 1] of [total]`
  instead of `[loadedCount] matches`.

**ImageDetail changes:**
- Counter: `[globalIndex + 1] of [total]` — needs `bufferOffset`.
- Prev/next: if at buffer boundary, trigger extend + wait before
  navigating. Show brief loading state.
- Prefetch: still prefetches ±3 images from the buffer. If at buffer
  edge, extend triggers first.

### Step 10: Basic scrubber UI (~3–4 hours)

**What:** Custom scrubber component — vertical track, proportional thumb,
click-to-seek, drag-to-seek.

**Where:** New `src/components/Scrubber.tsx`

**Props:**
```typescript
interface ScrubberProps {
  total: number;
  currentPosition: number;  // bufferOffset + visibleStart
  onSeek: (position: number) => void;
}
```

**Behaviour:**
- Vertical track, full height of content area, 12px wide, on the right.
- Thumb height = `max(20px, visibleCount / total * trackHeight)`.
- Thumb position = `currentPosition / total * trackHeight`.
- Click on track → `onSeek(clickPosition / trackHeight * total)`.
- Drag thumb → debounced `onSeek` at ~200ms intervals during drag.
  Show skeleton/placeholder while data loads.
- Scroll within buffer → thumb position updates smoothly.
- Hidden when `total ≤ buffer.length` (all data fits in buffer — native
  scrollbar is sufficient).

**Styling:** Match Grid palette. Semi-transparent until hovered. Thumb
uses `bg-grid-accent` on hover/drag.

#### Step 10 — Known Limitations (as of 2026-03-27)

The scrubber and deep seek work end-to-end but have these known
compromises. None are blocking; all have clear fix paths.

1. ~~**`extendBackward` blocked at deep offsets.**~~ **RESOLVED.**
   Now uses reverse `search_after`: `reverseSortClause()` flips every
   asc↔desc, `startCursor` as the anchor, DAL reverses returned hits.
   Works at any depth — no `from/size` offset limit. The `MAX_RESULT_WINDOW`
   guard was removed from `extendBackward`. `searchAfter()` DAL method
   accepts a `reverse` boolean parameter.

2. **Percentile estimation is approximate.** Deep seek uses ES TDigest
   `percentiles` to estimate the sort value at the target position.
   TDigest is accurate near the median but less so at extremes (0.1th,
   99.9th percentile). `countBefore` corrects `bufferOffset` to the
   exact landing position, so the displayed position number is correct —
   but the buffer may not be perfectly centred around the target. The
   user lands at the right position; only the overscan distribution is
   slightly off. Negligible UX impact.

3. ~~**Script sorts can't deep seek.**~~ **PARTIALLY RESOLVED.** Script sorts
   now use iterative `search_after` with `noSource: true` (Strategy B in
   `seek()`): pivot via `from/size` at `MAX_RESULT_WINDOW`, then skip forward
   in chunks until the target offset. `MAX_SKIP_ITERATIONS=200` cap prevents
   runaway. Works but is O(N/chunkSize) ES requests — ~50 requests for 500k
   on a 1.3M dataset. Keyword sorts (Credit, Source, etc.) use composite
   aggregation (`findKeywordSortValue`) — typically 1-5 pages, fast.
   Only `_script` sorts (Dimensions) use the slow iterative path.
   **Remaining limitation:** Script sorts at extreme depth (>500k in 9M+
   datasets) may take 3-10s. Consider UI feedback ("Dimensions sort:
   deep positions may be slow") if this becomes a user issue.

4. **~~Dual `seekTarget` clearing paths.~~** Resolved. The original
   `seekTarget` (React state) with its complex clearing effect was replaced
   with `pendingSeekPosRef` (a plain ref). Cleared in the render body on
   three conditions: total changed, currentPosition changed, or loading
   finished. No re-render cost, no race conditions.

5. **~~No position label on click-to-seek.~~** Resolved. The tooltip now
   appears on click (via `flashTooltip`) and lingers 1.5s before hiding.

6. **Direct DOM mutation for thumb position.** During drag and click, the
   thumb's `style.top` is set via ref (bypassing React). This is a
   standard React escape-hatch pattern (same as framer-motion, @dnd-kit)
   — React reconciles on the next render. Keeps drag at 60fps regardless
   of React scheduling. Not a compromise per se, but worth documenting
   since it's non-obvious code.

7. **Native scrollbar hidden.** The plan (line ~990-999) said to keep
   both in Phase 2. Departed early because dual-scrollbar UX was
   actively confusing (see deviations.md §19). Scrubber is now the sole
   scrollbar. Scroll mode (small sets) scrolls the container directly;
   seek mode (large sets) triggers seek. Wheel/trackpad still uses
   native physics via the hidden scrollable container.

8. ~~**Scrubber drag sensitivity too high for slow browsing.**~~ **RESOLVED
   (by design clarification).** After extensive experimentation with
   non-linear position mapping and velocity-based delta accumulation
   (see `scrubber-nonlinear-research.md` and deviations.md §20), the
   scrubber drag is now **simple linear with deferred seek**: thumb
   follows cursor linearly, no seeks during drag, one seek on pointer
   up. Fine-grained browsing uses wheel/trackpad (native scroll). Post-
   seek extend cascade suppressed by 500ms cooldown. Track click + keyboard
   unchanged. The 1px ≈ 1,600 items coarseness is inherent to linear
   mapping at this scale — acceptable because drag is a seeking tool,
   not a browsing tool.

#### Unrelated bug observed during Step 10 testing

**CQL chip search fires prematurely.** Typing `+credit:` in the CQL
input triggers a search for the incomplete chip value (e.g. `+cr` already
fires a search for `credit:cr`). Real Grid waits for meaningful value
input before searching. This is a pre-existing `@guardian/cql` /
`CqlSearchInput.tsx` issue, not related to the scrubber. Filed here to
avoid losing the observation.

### Step 11: Sort-around-focus (~3–4 hours)

**What:** When the user changes sort order, find the focused image's new
position and navigate to it.

**Where:** `search-store.ts`, `useDataWindow.ts`

**Algorithm (see "Never Lost — Sort-Around-Focus" section above):**
1. Run new search immediately (show results at top).
2. Async: get focused image's sort values → `countBefore` query → global
   offset → seek if needed → focus.
3. Brief "Finding image…" indicator.

**Edge cases:**
- No focused image → standard sort (show top of new sort order).
- Focused image not in results (filter change + sort change) → "Never
  Lost" adjacency scan (already implemented).
- `countBefore` fails (network error) → graceful degradation: just show
  results from top.

### Step 12+: Scrubber labels and polish (Phase 2+ / Phase 6)

**Not in this plan's scope.** Listed for completeness:

- Date labels while dragging (from histogram agg).
- First-letter markers for keyword sorts.
- Non-linear scrubber mapping (distribution-aware via ES histogram data).
  Pure-math non-linear drag was explored and rejected (limitation #8,
  `scrubber-nonlinear-research.md`, deviations.md §20). Distribution-
  aware mapping is a different problem — using bucket counts to warp the
  track so dense regions get more pixels. Separate Phase 6 work.
- Smooth seek animations.
- Mobile touch gestures.
- Histogram bar chart overlay on scrubber track.

---

## Development Workflow — When to Run the App

### Development phases (for the human)

All development happens against **local ES** (docker, port 9220, 10k docs).
The app should be **stopped** while I work — I'll be refactoring the core
data pipeline (store, adapter, hook) and intermediate states will send
malformed queries.

There are **four explicit test checkpoints** where I'll ask you to start
the app and verify:

#### 🧪 Checkpoint A: After steps 1–3 (DAL changes)

**When:** Tiebreaker sort, sort value storage, and `search_after` + PIT
methods are implemented in the adapter.

**How to test:**
1. Start app with `./kupua/scripts/start.sh` (local ES, default mode)
2. Open browser, verify search works normally (tiebreaker is transparent)
3. Open DevTools → Network tab. Search for something. Inspect the
   `_search` request body — verify the `sort` array ends with `{"_id":"asc"}`
4. If PIT methods are testable locally: I'll add a temporary console log
   showing "PIT opened: <id>" — verify it appears on first search

**What you're verifying:** Nothing broke. The tiebreaker is invisible to
the user. Sort behaviour is identical.

**Risk to TEST:** Zero — this checkpoint is local-only.

#### 🧪 Checkpoint B: After steps 4–7 (windowed buffer)

**When:** The core refactor is done — sparse array replaced with windowed
buffer, forward/backward extend, seek, eviction all working.

**How to test (local):**
1. Start app (local ES)
2. Search for something with <10k results
3. Scroll down — verify smooth loading, no gaps, no duplicates
4. Scroll back up — verify data reappears (backward extend)
5. Open DevTools → Console. I'll add temporary logs:
   - `[buffer] extend forward: offset N → N+200`
   - `[buffer] extend backward: offset N → N-200`
   - `[buffer] evict: removed 200 from start, new offset: N`
6. Verify buffer logs show eviction happening (buffer stays bounded)
7. Sort by different columns — verify data loads correctly

**What you're verifying:** The buffer model works. Scrolling feels the
same (or better) than before. Memory doesn't grow unboundedly.

**Risk to TEST:** Zero — still local-only.

#### 🧪 Checkpoint C: After steps 8–9 (view adaptation) — TEST

**When:** Views (table, grid, detail) work with the new buffer. This is
the first point where TEST validation is valuable.

**How to test (TEST):**
1. Start app with `./kupua/scripts/start.sh --use-TEST`
2. Default search (all images, ~9M) — verify results appear
3. Scroll down significantly (several hundred rows) — verify smooth loading
4. Scroll back up — verify no gaps or duplicates
5. Switch between table and grid view — verify both work
6. Open image detail, navigate prev/next — verify counter + navigation
7. Try a filtered search (e.g. `credit:"Getty"`) — verify results
8. Sort by different columns while scrolled — verify reset-to-top works
9. Check browser memory (DevTools → Memory → Heap snapshot) after heavy
   scrolling — should be <50MB regardless of scroll depth

**What you're verifying:** The windowed buffer works at real scale. PIT
keeps pagination stable. No visible regressions from the current behaviour.

**Risk to TEST:** Very low. All queries are read-only `_search` + `_count`
+ `_pit` (open/close). Same query volume as today. PIT holds old segments
briefly (~5 min keepalive) — negligible on a multi-TB index. Monitor the
cluster health dashboard for any anomalies during testing, but I expect none.

#### 🧪 Checkpoint D: After step 10 (scrubber) — TEST ✅ PASSED (2026-03-27)

**When:** The scrubber UI is implemented and connected.

**Result:** Tested on TEST ES (~1.3M results). Seek accuracy, drag, click,
logo reset, Home/End, sort change, thumb stability all verified. Three
rounds of interaction fixes were needed post-implementation (sync bugs,
tooltip live update, grab offset, click-without-drag). All resolved.

**How to test (TEST):**
1. Start with `--use-TEST`
2. Search for something large (unfiltered, ~9M results)
3. The scrubber should appear on the right edge
4. Drag the scrubber thumb to ~50% — verify the content jumps to the
   middle of the result set (roughly position 4.5M)
5. Drag to ~90% — verify you're near the end
6. Drag back to 0% — verify you're at the start
7. Normal scroll — verify the scrubber thumb tracks your position
8. Filter to a small result set (<1000) — verify scrubber hides
   (all data fits in buffer)
9. Check that rapid scrubber drags don't flood the network (inspect
   DevTools → Network — should see debounced seeks, not one per pixel)

**What you're verifying:** The scrubber works at scale. Position is accurate.
Seek is fast enough to feel responsive (~200ms target).

**Risk to TEST:** Same as Checkpoint C — read-only, low additional load.
Rapid seeks fire `search_after` queries but they're lightweight (size:200,
no scoring) and debounced.

### What I don't need from you during development

- No console output needed — I'll read local ES responses directly.
- No special configuration — local docker ES is sufficient for all code work.
- No test data changes — the 10k sample dataset is enough to validate
  `search_after`, PIT, buffer management, and eviction.

### What 10k local data CAN'T validate

- Scrubber feel at 9M scale (is seek latency acceptable?)
- PIT under real load (does the cluster notice?)
- Memory at real data complexity (5-10KB per real doc vs potentially
  simpler sample docs)
- Backward extend across very sparse result regions (rare in 10k)

These all require TEST — hence Checkpoints C and D.

---

## Commit Strategy

Self-contained commits grouped by the problem they solve. Not one giant
commit, not one per file. Original plan targeted 5 commits; in practice
commits 2 and 3 were merged (buffer + views are not independently
testable). **Actual: 3 commits done + 1 pending.**

### Commit 1: DAL — search_after + PIT + tiebreaker (steps 1–3)

**Files:** `es-adapter.ts`, `types.ts`, `es-config.ts`

**What:** New DAL methods (`searchAfter`, `openPit`, `closePit`, `countBefore`),
tiebreaker appended to `buildSortClause`, sort values preserved from ES
responses, `_pit` added to `ALLOWED_ES_PATHS`.

**Self-contained:** The existing `search()`/`searchRange()` still work.
New methods are additive — nothing calls them yet. App works exactly as
before. Testable in isolation against local ES.

### Commit 2: Windowed buffer + view adaptation (steps 4–9)

**Files:** `search-store.ts`, `useDataWindow.ts`, `ImageTable.tsx`,
`ImageGrid.tsx`, `ImageDetail.tsx`, `StatusBar.tsx`, `search.tsx`

**What:** `results[]` replaced with fixed-capacity buffer + `bufferOffset`.
New actions (`extendForward`, `extendBackward`, `seek`). Page eviction.
`useDataWindow` adapted to buffer model. Views updated to buffer-local
indexing. Counter shows global position. Buffer extend triggers at edges.
Old `loadMore`/`loadRange` kept as deprecated aliases.

**Self-contained:** Merges the original planned commits 2 (buffer) and 3
(views) — they weren't independently testable since the views break
without the buffer model. After this commit, the app works end-to-end
with windowed scroll on both local and TEST ES (checkpoints B + C).

### Commit 3: Scrubber UI (step 10)

**Files:** New `Scrubber.tsx`, `search.tsx`, `index.css`,
`useDataWindow.ts` (visible range), `useListNavigation.ts` (Home/End
seek), `ImageTable.tsx`, `ImageGrid.tsx` (hide-scrollbar), `SearchBar.tsx`
+ `ImageDetail.tsx` (logo click explicit search), `scroll-reset.ts`
(thumb DOM reset), `es-adapter.ts` + `types.ts` (countBefore signal),
`search-store.ts` (deep seek, abort fix)

**What:** Scrubber component (click-to-seek, drag-to-seek, keyboard,
position tooltip). Deep seek via percentile estimation (>10k offset).
Native scrollbar hidden. Three rounds of interaction bug fixes:
(1) callback ref for ResizeObserver, pendingSeekPosRef replacing seekTarget
state, abort signal on countBefore, logo click explicit search;
(2) tooltip live text, grab-offset, Home/End preventDefault, PgUp scan;
(3) click-without-drag no-op (hasMoved flag). Checkpoint D passed.

**Next:** Commit 4 (sort-around-focus, step 11).

**Self-contained:** Independent UI addition. The buffer + views already
support seeking — the scrubber is a new input for it.

### Commit 4: Sort-around-focus + scrubber polish + backward hardening (steps 11–12 partial) — done

**Files:** `search-store.ts`, `useUrlSearchSync.ts`, `es-adapter.ts`,
`types.ts`, `index.ts` (DAL barrel), `Scrubber.tsx`, `StatusBar.tsx`,
`ImageTable.tsx`, `ImageGrid.tsx`, `search.tsx`, `sort-context.ts` (new),
`index.css`, `deviations.md`, `AGENTS.md`, this file.

**What:**
- **`extendBackward` via reverse `search_after`** (limitation #1 fixed):
  `reverseSortClause()` helper flips sort direction, `searchAfter()` accepts
  `reverse` boolean, DAL reverses hits before returning. Replaces `from/size`
  fallback — works at any depth after deep seek.
- **Sort-around-focus ("Never Lost")**: `search()` accepts optional
  `sortAroundFocusId`. URL sync hook detects sort-only changes and passes
  `focusedImageId`. After initial results show at top, async
  `_findAndFocusImage()`: fetch image by ID → get sort values →
  `countBefore` → exact global offset → seek if outside buffer → focus +
  scroll. Status indicator in StatusBar. `sortAroundFocusGeneration` counter
  triggers scroll-to-focused in views.
- **Sort-aware scrubber tooltip**: `getSortLabel` callback from `search.tsx`
  reads nearest loaded image's sort field value. Date sorts show formatted
  date, keyword sorts show value. `sort-context.ts` utility with
  `SORT_LABEL_MAP` and alias resolution. Updated live during drag via DOM
  writes (`data-sort-label` span).
- **Scrubber Shift+Arrow**: steps by 500 instead of 50.
- **Scrubber auto-hide**: fades to opacity 0 after 2s inactivity, fades in
  on scroll/hover/focus/drag. 300ms transition.
- **Prior uncommitted fixes rolled in**: deferred-seek scrubber drag, 500ms
  post-seek extend cooldown, `contain: strict` on scroll containers, z-index
  fixes.

**Self-contained:** Sort-around-focus degrades gracefully (image not found →
stay at top). Reverse extend is invisible to the user (just removes a silent
failure). Scrubber tooltip/auto-hide are pure polish.

### Deferred (not in this batch)

- Non-linear mapping (Phase 6)
- Histogram aggregation for scrubber (Phase 6)

---

## Open Questions

### 1. PIT on local ES — worth it?

Local ES has 10k stable docs. PIT adds complexity for no benefit locally.

**Recommendation:** Skip PIT on local ES (`IS_LOCAL_ES`). Use `from/size`
for local extends (within the 10k cap). `search_after` works without PIT
(just less consistent) — use it locally for testing the code path, but
skip the PIT open/close overhead.

### 2. Buffer capacity — 1000 or configurable?

1000 is a reasonable default. Should it be configurable?

**Recommendation:** Constant (`BUFFER_CAPACITY = 1000`) for now. If
profiling shows it should vary (low-memory mobile = 500, desktop = 2000),
make it configurable later. Not worth the complexity now.

### 3. Backward extend — is it needed in Phase 2?

Users rarely scroll backward (they search → scroll forward → refine).
Backward extend adds ~40% of the complexity (reverse sort, prepend logic,
start cursor management).

**Recommendation:** Yes, implement it. Without backward extend, scrolling
back to previously-seen data shows placeholders — unacceptable UX.
The complexity is manageable and the code is symmetric with forward extend.

### 4. search_after vs. from/size for short extends

If the user scrolls 50 rows forward and the buffer endpoint is at global
position 999, the next fetch could use either:
- `from/size` at offset 1000 (simple, but capped at 100k)
- `search_after` with the end cursor (no cap, consistent with PIT)

**Recommendation:** Always use `search_after` when PIT is active. It's
equally fast for small offsets and removes the 100k concern entirely.
Fall back to `from/size` only on local ES (no PIT) or when PIT has expired
and we're within the 100k window.

### 5. How to handle PIT expiry mid-session

> See "PIT expiry (ES idle timeout = 5 minutes)" in §7 for the full
> explanation of 5m idle timeout vs 10m freshness refresh.

If the user goes idle for >5 minutes, the ES idle timer expires the PIT.
This is independent of the 10-minute freshness timer (which swaps the PIT
for active users to bound staleness). Next scroll fires a `search_after`
with an expired PIT ID → ES returns 404.

**Recommendation:** Catch 404 on expired PIT → open new PIT → retry the
request. The buffer may have slightly different data (live index changed),
but this is imperceptible for a user who was idle for 5+ minutes. Log the
re-open for debugging.

### 6. What about the image-offset-cache (sessionStorage)?

`image-offset-cache.ts` stores the image's offset in sessionStorage for
page reload. With the windowed buffer, we need both the offset AND the
cursor at that position to restore efficiently.

**Recommendation:** Extend the cache to store `{ offset, cursor, searchKey }`.
On reload, use the cursor for `search_after` (exact position) rather than
`from/size` offset (subject to 100k cap). Degrade to offset-based if
cursor is unavailable.

### 7. Aggregations — do they need PIT?

Currently, `fetchAggregations` runs against the live index. Should it use
the PIT?

**Recommendation:** No. Aggregation facet counts should reflect the live
index (current reality), not the PIT snapshot. The PIT is for pagination
consistency; aggs are for discovery. Mismatch is minimal and expected.

---

## Test Strategy

### Unit tests

- `buildSortClause` always includes `_id` tiebreaker
- `countBefore` query construction for various sort types
- Buffer eviction logic: capacity enforcement, cursor updates
- Index translation: `bufferOffset + local = global`

### Integration tests (local ES)

- `search_after` pagination: first page → next → next → verify no gaps
- Backward extend: reach a position, scroll back, verify continuity
- Seek: jump to offset 5000 (within 10k local data), verify correct data
- PIT lifecycle: open → search → close
- PIT expiry simulation: use expired ID → graceful re-open

### Manual testing (TEST ES via tunnel)

- Scrub through 9M results — thumb position accurate
- Sort change with focused image — image found and centered
- Long idle → scroll → PIT re-open transparent
- Filter narrowing → scrubber reflects new total
- Rapid scrubber drag → debounced seeks, no request flooding
- Browser back/forward → scrubber position preserved via URL

### Performance benchmarks

- Buffer extend latency: `search_after` on 9M index (target: <50ms)
- Seek latency: clear + refetch (target: <200ms including render)
- `countBefore` latency: 9M index (target: <50ms)
- Memory usage: verify bounded at ~10MB regardless of scroll depth
- PIT open/close overhead: <20ms

---

## Summary

This plan transforms kupua from a 100k-row browser into a tool that can
fluently navigate 9 million images. The changes are:

1. **Mechanical** (steps 1–3): tiebreaker sort, sort value storage,
   `search_after` + PIT in the DAL. Low risk, testable in isolation.

2. **Architectural** (steps 4–7): windowed buffer replaces unbounded
   sparse array. The core refactor. Bounded by `useDataWindow` abstraction.

3. **Surface** (steps 8–10): adapt the existing views and add the scrubber
   UI. Views change minimally thanks to the hook abstraction.

4. **Payoff** (step 11): sort-around-focus finally works — the "Never Lost"
   principle fulfilled.

Total estimated effort: **~25–35 hours** across steps 1–11.

Steps 1–3 are safe to start immediately. Step 4 is the big bang but is
self-contained within the store. Steps 5–11 follow naturally.













