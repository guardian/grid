# Scroll Architecture — How Kupua Browses Millions

> **Audience:** Staff Engineers reviewing the approach, future agents, and
> anyone inheriting this codebase.
>
> **§0** frames why the architecture has this shape.
> **§1–§2** are accessible to anyone familiar with web UIs.
> **§3** bridges UX and implementation.
> **§4–§6** require understanding of React rendering, virtual scrolling, and
> Elasticsearch internals.

---

## §0 Why This Architecture Exists

Kupua presents a single ordered list of images. Table, grid, image detail,
and fullscreen preview are **different densities** of the same list — not
separate pages. Transitions between them feel like zooming, not navigating.
(See `frontend-philosophy.md` for the full design philosophy.)

This has an architectural consequence: **the user's context must survive
every transition.** We call this the "Never Lost" principle — focus,
selection, scroll position, and eventually edit state all persist across
density changes, sort changes, and filter changes. The scroll architecture
below exists to uphold that principle at the scale of millions.

The central constraint is the **buffer architecture.** We can hold at most
~1,000 images in memory (bounded by `BUFFER_CAPACITY`). For a result set
of 1.3M, that's 0.08% coverage. Every mechanism described below — the
windowed buffer, cursor-based pagination, the scrubber, seek strategies,
scroll compensation — follows from that single constraint: we can only see
a tiny window into a vast ordered list, and the user must never feel it.

---

## §1 The Problem

The Guardian's image library contains ~9 million documents in Elasticsearch.
Users need to scroll through filtered views that range from 50 images to the
full 9M. The browser's native scrollbar and `from/size` pagination cannot
serve this.

### Why the browser can't help

| Constraint | Limit | Impact |
|---|---|---|
| Browser max element height | ~33,554,432px (Chrome) | At 303px/row and 4 columns, ~9M images need ~680M px. 20× over the limit. |
| `from/size` pagination | Configurable `max_result_window` (101k on PROD) | ES must score + skip all preceding docs. O(n) to reach position n. At 500k it's multiple seconds. |
| Memory | ~5–10KB per image document | 9M × 8KB = 72GB. Can't hold the full set in memory. |

Even with aggressive virtualisation, the native scrollbar's pixel-to-position
mapping breaks above ~100k items. You need a different control for position.

### Why this is different from Google Photos, iCloud, immich

These services hold the **full ID list** in memory and use O(1) random
access to any position:

| Service | Strategy | Why it works |
|---|---|---|
| Google Photos | Server sends full position map | They control the backend; IDs are small (~20 bytes) |
| iCloud Photos | Core Data with pre-computed section indices | Local SQLite; full catalogue fits in RAM |
| immich | Full ID list in memory, client-side virtual scroll | Self-hosted; typical libraries are <1M items |

At 9M docs × ~40 bytes per sort key = **360MB** just for the position map.
At 57M documents, that's 2.3GB. A position map for the full
set is impossible. We can't random-access by offset past 100k.

But most user interactions don't involve the full 9M. Filtered views, date
ranges, and single-day queries typically return between a few hundred and
~65,000 images. For these smaller result sets, a lightweight position map
*is* feasible (~288 bytes/entry = ~18MB at 65k). This creates a natural
boundary: below 65k, we can achieve Google-Photos-like instant scrolling;
above it, we need a different approach.

This observation is the origin of kupua's **three-tier architecture**.

---

## §2 The Three Tiers

The architecture has three distinct modes, selected automatically based on
the size of the current result set. Each mode represents a different
trade-off between data coverage and interaction fidelity.

```
 Result count     Mode                     Scrubber behaviour
 ─────────────────────────────────────────────────────────────
 ≤ 1,000          Scroll mode              Real scrollbar (all data loaded)
 1,001 – 65,000   Indexed scroll mode      Real scrollbar (position map + sliding buffer)
 > 65,000         Seek mode                Seek control (teleport on release)
```

### Why three tiers and not one?

Each tier exists because the one above it breaks at a certain scale:

**Scroll mode (≤1,000)** downloads every image's full data into memory.
The scroll container literally contains all items. The scrubber is a real
scrollbar because the browser already knows where everything is. This is
the simplest possible implementation — no position map, no skeleton
placeholders, no seek-on-scroll. Just a normal scrollable list. It works
perfectly but can't scale: 65k images × ~8KB each = 500MB, which would
crash the browser.

**Indexed scroll mode (1k–65k)** can't download all the data, but it
*can* download a lightweight index of every image's position — just IDs and
sort values, ~288 bytes/entry instead of ~8KB. This position map lets the
virtualizer render `total` items (not just the ~1,000 in the buffer), giving
the scroll container full physical height. The scrubber works exactly like a
real scrollbar — drag directly scrolls the content. Cells outside the
~1,000-item buffer show skeleton placeholders that fill in as the buffer
slides around via extends and scroll-triggered seeks. This mode couldn't
handle 9M images: 9M × 288 bytes = 2.5GB for the position map alone.

**Seek mode (>65k)** can't build a position map (too much data), so the
scrubber becomes a fundamentally different control. Dragging moves the thumb
and shows a tooltip with the estimated position, but the content doesn't
scroll. Releasing the thumb triggers a `seek()` — the buffer is cleared and
refilled at the target position. This takes 200–600ms (one network
round-trip). The user experiences a brief "teleport" rather than continuous
scrolling. It works at any scale, from 100k to 9M.

**Why not just use indexed scroll mode for ≤1,000?** You could, but it would
be strictly worse: it would add an unnecessary background fetch for the
position map, run the skeleton rendering machinery, and introduce the
scroll-triggered seek debounce timer — all for zero benefit, since the
buffer already contains every image. The simpler approach is faster and
has no edge cases.

### The architecture at a glance

```
┌─────────────────────────────────────────────────────────┐
│                    9 million results                    │
│  ┌───────────┐                                          │
│  │ ← extend  │◄── reverse search_after (startCursor)    │
│  ├───────────┤                                          │
│  │           │                                          │
│  │  Buffer   │  1,000 items max (BUFFER_CAPACITY)       │
│  │           │  bufferOffset maps buffer[0] → global    │
│  │           │                                          │
│  ├───────────┤                                          │
│  │  extend → │──► forward search_after (endCursor)      │
│  └───────────┘                                          │
│                                                         │
│      Scrubber thumb ═══════════►  seek(globalOffset)    │
│      (proportional to total)      clears buffer,        │
│                                   refills at target     │
│                                                         │
│  Position Map (1k–65k only):                            │
│  [id₀, sortValues₀] [id₁, sortValues₁] ... [idₙ, ...]   │
│  ~288 bytes/entry, ~18MB at 65k. Enables exact seek     │
│  + two-tier virtualisation (virtualizer spans total).   │
└─────────────────────────────────────────────────────────┘
```

**Four operations move through the data:**

1. **Extend forward/backward** — sequential browsing. `search_after` with
   a cursor. O(page_size), no depth limit. Appends or prepends to the
   buffer; evicts from the opposite end to stay within capacity.

2. **Seek** — random access. Scrubber click/drag (seek mode) or
   scroll-triggered reposition (indexed scroll mode). Clears the buffer and
   fills it at the target position. Strategy depends on the tier (see §5).

3. **Sort-around-focus** — after a sort change, finds the focused image's
   new position and seeks to it. The user sees "Never Lost" — their image
   stays focused regardless of how it reorders.

4. **Two-tier virtualisation** — in indexed scroll mode, the virtualizer
   renders `total` items (not just the buffer). Cells outside the buffer
   show skeleton placeholders. The buffer slides via extends and debounced
   scroll-triggered seeks to fill them.

### The central invariant: `twoTier`

```ts
const twoTier =
  POSITION_MAP_THRESHOLD > 0 &&
  total > SCROLL_MODE_THRESHOLD &&
  total <= POSITION_MAP_THRESHOLD;
```

When `false`: data-window indices are buffer-local and span `results.length`.
The fixed-grid virtualizer groups these items into origin-aware rows, described
below. The scrubber is either a scrollbar (scroll mode) or a seek control (seek mode).

When `true`: indices become global, the scroll container spans all `total`
items, and the scrubber drag directly scrolls the container.

**`twoTier` is derived from total, not from positionMap.** The position map
is a **performance optimisation** (faster seeks via exact cursor lookup);
the coordinate-space decision (`twoTier`) is based on total alone. Deriving
it from `positionMap !== null` would cause a late coordinate-space flip
whenever the map arrives after a seek — scrollHeight would jump from ~13k
to ~2.6M while scrollTop stayed put, permanently deadlocking the viewport
on skeletons. By basing on total, the coordinate space is stable from
frame 1.

**Explicitly incomplete collection:** either phase reporting `timed_out: true` or a
positive failed-shard count discards the entire map, including earlier pages, and returns
`null`. The latest refreshed dedicated PIT is closed on that exit and on abort. This check
precedes hit consumption and empty/short-page exhaustion; absent execution metadata alone
is not newly rejected. There is no automatic retry, per-page total or live continuation.
Existing no-map navigation remains available with the same total-based coordinates. It
can be more expensive than exact map lookup; no fallback performance parity is promised.

**Consequence for transitions:** `search()` invalidates the position map
(`positionMap: null`), but `twoTier` stays true as long as the new result
set's total is in range (1k < total ≤ 65k). The virtualizer count, scroll
height, and index coordinate space are all stable across the transition.
The scrubber operates in scroll mode immediately (setting scrollTop
directly), even before the position map reloads — skeletons appear at the
correct position, and a scroll-triggered seek fills them within ~1-2s.
`seek()` does not invalidate the position map — the data is still valid
(same PIT, same sort order).

### Fixed-Row Window Policy

**Buffer boundaries do not determine Grid row membership.** At unchanged
query/order and viewport width, maintenance preserves the positions and sizes of all
surviving visible fixed-grid images, not just an elected anchor. Each image keeps
the row and column implied by its global result position; moving the loaded window
only changes the local vertical origin. Positions come from the store, including
estimated seek landings. Geometry consumes them without performing rank lookups;
the mapping makes no backend snapshot-consistency guarantee.

For a buffer-local window, the mapping is:

```text
rowOrigin = floor(bufferOffset / columns)
column = globalIndex % columns
rowIndex = floor(globalIndex / columns) - rowOrigin
rowTop = rowIndex * rowHeight
rowCount = count === 0 ? 0 : ceil((bufferOffset % columns + count) / columns)
```

The item API remains buffer-local; the geometry descriptor supplies `itemOffset`
and `itemCount`. Indexed Grid uses global item indices with origin zero and count
`total`. Table is the one-column case. The shared mapping in
[scroll-geometry-ref.ts](../../../src/lib/scroll-geometry-ref.ts) owns row bounds,
item-to-row conversion, row count and column placement. Rendering, visible-range
reporting, keyboard navigation, history/return placement and destination-seek
preparation must use the same mapping.

**Accepted UX trade-off:** at a temporary buffer boundary, the first loaded image
may start partway across a row. Up to `columns - 1` leading positions remain empty;
they are layout space, not synthetic image records, focus targets or selected items.
Earlier arrivals fill those positions without regrouping retained images. The true
result start has no leading gap. This exposes a loading boundary rather than hiding
it behind a later sideways jump; it does not remove the wait for missing data.

The search store retains complete fetched pages and evicts only the capacity excess.
Seek and around-image restoration keep complete pages regardless of current columns.
True-start correction, ordered IDs, authoritative cursor tuples and capacity limits
apply. Offsets may have any remainder under the current column count.

For unchanged fixed geometry, prepend and eviction share one compensation:

```text
delta = (floor(oldBufferOffset / columns) - floor(newBufferOffset / columns)) * rowHeight
newScrollTop = prePublicationScrollTop + delta
```

This uses the net origin movement, not the last page count, and therefore covers
coalesced publications and a shrinking scroll extent. Indexed views need no such
translation. Search/seek/sort/reset ownership guards remain; physical clamping and
eviction of the observed image are not promises of recoverable viewport space.

Resize is an intentional reflow with selection, focus, then viewport anchor
precedence. Capture uses the last committed fixed geometry, then resolves the
surviving identity in the destination. If columns and buffer offset change in one
commit, resize restoration owns placement instead of also applying maintenance
compensation. Do not combine an old rendered row with a newly published origin.

Justified owns dimension-dependent packing and identity-based compensation. Fixed-row
geometry does not determine those boxes or media readiness. Fixed Grid cell keys identify
physical columns within each virtual row, not buffer-local indices whose column changes
with the window remainder. This keeps reused old thumbnail pixels in their original slots
during seek replacement, without changing virtual-row keys or adding a media-readiness barrier.
Justified retains its existing cell-key policy. Page/concurrency limits, overscan, thumbnail
admission and fetch horizons have separate owners and configuration.

---

## §3 The User Experience — What It Feels Like

### Normal scrolling (all tiers)

The user scrolls with mouse wheel or trackpad. TanStack Virtual renders
~15–30 visible rows from the buffer. When the viewport approaches the
buffer edge (within `EXTEND_THRESHOLD = 50` items), `reportVisibleRange`
triggers `extendForward` or `extendBackward`. The extend fetches
`PAGE_SIZE = 200` items via `search_after`, appends/prepends them, and
evicts from the opposite end if the buffer exceeds `BUFFER_CAPACITY = 1000`.

Headroom aims to hide refill latency, but its physical size depends on density.
A finite buffer can still stop scrolling when a refill misses the edge; earlier
admission cannot overcome sustained consumption above delivery throughput.

**Velocity-aware forward trigger.** At sustained fast wheel velocity (e.g.
the table fast-scroll perf test eats ~1700 items/s) the user can chew
through 50 items in less than a single ES round-trip (~100–500ms),
pinning `scrollTop` at the buffer's bottom until the extend returns.
`reportVisibleRange` mitigates this by tracking an EMA-smoothed forward
velocity and widening the forward threshold to
`EXTEND_THRESHOLD + velocity × VELOCITY_LOOKAHEAD_MS`, capped at
`PAGE_SIZE = 200`. Effect: at rest the trigger is the bare 50; under a
fast burst the extend fires up to ~150 items earlier, and the fetch
overlaps with the user still consuming buffered content.

Velocity samples are separate from navigation intent. `useScrollEffects` admits a
sample only when the reported first/last rows match the current scroll viewport
(with a one-pixel boundary tolerance and an explicit last-row allowance).
`useDataWindow` resets the baseline across reporting-owner, result-publication,
buffer-offset, search-generation, total, layout or viewport-height changes. Invalid
samples also reset it. A stationary range correction rebases the end index without
counting it as movement. Sampling does not scan the buffer or own viewport placement.

Visible-range reporting and base edge admission still run without a velocity sample.
Prediction therefore does not depend on wheel/touch/key provenance: valid scrollbar
and programmatic movement use the same sampling path. The separate navigation flag
continues to own indexed destination intent.

Buffer-local maintenance checks each edge separately when the scroll owner supplies
viewport-validity evidence. An explicitly stale first row cannot admit a backward
refill; an explicitly stale last row cannot admit a forward refill. The latter avoids
a refill chain while the virtualizer still reports the old tail after eviction
compensation. Visible-range reporting continues, and one valid edge can admit demand
without both edges qualifying for a velocity sample. Callers omitting this evidence
retain base admission; indexed admission uses its global-range rules. Valid programmatic movement
remains eligible. Prediction is still forward-only, the backward threshold remains
50, and neither guard changes the configured fetch horizons.

### Scrolling past the buffer (indexed scroll mode)

In indexed scroll mode, the scroll container spans all `total` items. The
user can drag the scrubber or scroll rapidly past the ~1,000-item buffer.
Cells outside the buffer appear as skeleton placeholders. After a 200ms
debounce, a scroll-triggered `seek()` repositions the buffer at the
viewport's current position. Skeletons fill in within ~200–450ms (PROD).
Extends can't bridge the gap between the viewport and a distant buffer —
only seek can reposition across thousands of items.

User browsing and layout maintenance have different owners. Scrubber input, including
its wheel bridge, records its destination before native scrolling. Wheel/touch/navigation-key provenance lets
`useDataWindow` queue a user destination when the viewport leaves the buffer. That
store-owned 200 ms queue survives density unmount and is superseded by newer browsing
or search, not by the new view's initial range report.

Layout-only reports retain a hook-owned refill timer. Reset, changed search generation,
query/order, leaving the indexed tier or disposal of that reporter cancels it. An
unrelated detail consumer's unmount and ordinary buffer publication do not. Obsolete
callbacks cannot dispatch or clear their successor; refills cannot supersede pending
user navigation or initial search. Their query fingerprints remain cached by params
identity. Position-map readiness remains independent of either lifetime and of the
coordinate regime.

When browsing overlaps an ordinary query change, the old visible total is not used
as current membership. Navigation retains the existing count/first-page discovery,
resolves End and clamps destinations against the new total, and publishes total and
window together. Cursor/focus replacements inherit that discovery too. A failed or
cancelled replacement with no newer owner can finish from the already-requested first
page; late work cannot reclaim placement. Previously accepted freeze/map/poll work is
reused, not restarted. Pending or settled AI queries never issue ordinary window reads.

### Deep seek (scrubber click at 50% of 1.3M results, seek mode)

1. User clicks the scrubber track at 50% → `seek(650000)`.
2. `seek()` sets `SEEK_COOLDOWN_MS = 100ms` — blocks all extends.
3. Deep path: ES `percentiles` aggregation estimates the `uploadTime` at
   the 50th percentile → e.g. `2024-08-15T14:22:00.000Z`.
4. Forward `search_after([estimated_date, ""])` fetches 200 items starting
   there. Then a backward `search_after` (reversed, halfBuffer ≈ 100 items)
   fetches items before the cursor. Combined buffer ≈ 300 items with the
   user's viewport in the middle (~100 items of headroom above).
5. `countBefore` query returns the exact global offset we landed at.
   `bufferOffset` adjusted for backward items: `actualOffset - backwardHits`.
6. The store prepares the destination target from current `scrollTop` and destination
   geometry, then publishes it with the replacement buffer and `_seekGeneration`.
7. `useScrollEffects` effect #6 applies that target through current geometry;
   the existing row-delta guard avoids unnecessary movement, with sub-row carry
   applied separately when required.
8. At 150ms (`SEEK_DEFERRED_SCROLL_MS`), a synthetic scroll event triggers
   `reportVisibleRange`. With ~100 items of headroom, `startIndex > 50`
   (EXTEND_THRESHOLD) — **no immediate backward extend**. Forward extend
   fires if needed.
9. As the user scrolls up past the headroom, `extendBackward` fires and
   prepends to off-screen content — **invisible** by construction.
10. Post-extend cooldown (50ms) prevents cascading compensations.

Total time: ~250–600ms on real ES (one extra backward fetch, ~50-100ms).
Settle-window content shift: **0 items** (bidirectional seek ensures all prepends
happen off-screen).

### Destination seek preparation

[prepareDestinationSeek](../../../src/lib/destination-seek.ts) owns the shared numeric
headroom adjustment, sub-row carry selection and requested true-end target. Reaching the
end requires the destination buffer to cover the effective total, not merely a near-end
request. The store retains null-zone-aware totals, exact-versus-estimated admission, cursor
mapping, publication and separately owned focus intent. Exact offsets bypass reverse
preparation; the helper performs no reads, scroll writes or state changes.

Fixed-row `computeScrollTarget` retains extrapolation and arithmetic shrink handling.
Variable `prepareSeek` constructs destination geometry, clamps lookup and handles empty
destinations before applying shared policy, then retains its own shrink/final clamping.
Do not replace either with invented columns or average-row geometry. The empty fixed
calculator can return -1; variable preparation returns 0. These are retained calculator
contracts, not permission to publish a nonexistent image. Caller-level tests remain
independent of the helper. This policy extraction is a maintenance change, not a speedup.

### Sort-around-focus ("Never Lost")

1. User changes sort from `uploadTime desc` to `credit asc`.
2. Effect 7 captures ordinary/AI target, placement and focus treatment together before
   passive effects. URL sync consumes that record and dispatches `search()`.
3. `search()` fetches page 1. If the target is present, results and owned placement
   publish together. Otherwise the previous buffer stays visible while resolution runs.
4. For an out-of-first-page target, `_findAndFocusImage` runs:
   a. Fetches the focused image with current sort → gets its `sort[]` values.
   b. `countBefore` → exact global offset (e.g. position 847,291). When
      the position map is loaded, this step is skipped — the map already
      knows the image's global offset.
   c. `_loadBufferAroundImage` uses bidirectional `search_after` from that cursor.
      Where rank is estimated, the exact-rank request and buffer reads run in parallel.
   d. Final aligned coordinates, cursors, total, buffer and resolved target publish
      together; the initial page is only a fallback if resolution fails.
5. `sortAroundFocusGeneration` increments → `useScrollEffects` effect #9
   applies the captured placement using the existing focus owner and current view
   geometry. A selected target supplies placement without replacing older focus.

The old content remains until the final target window is ready; there is no deliberate
first-page flash. Placement retains the captured ratio subject to the existing full-row
and scroll-range clamps. The placed record cannot replay on density remount; history
continues to use its compatibility ratio path. AI entry publishes the same handoff
with its finite list; re-sort replaces the existing placement owner without cancelling
pending discovery, whose completion consumes the latest same-query handoff. AI exit
uses identity-only ordinary resolution. If published placement waits for mount
geometry, newer relevant input retires it across all mount-frame paths; input before
publication leaves it eligible. No performance equivalence is implied.

### Keep-position across density switches (table ↔ grid)

When switching from table to grid (or vice versa):

If browsing has a pending destination, that destination owns final placement.
The store retains queued/loading/ready navigation independently
of the mounted component. Density cancels obsolete maintenance, not the destination;
the current view consumes ready placement after its two-frame geometry readiness.
Indexed views can position skeletons at the requested global coordinate while data
is pending. Seek-tier views retain the visible departure anchor through the density
bridge, tagged with the navigation signal. Mount layout positions that anchor before
paint using current geometry and checks ownership again at readiness; a ready arrival
or successor cannot receive that departure restoration. Focus and tickbox selection
remain separate from this viewport intent.

The Scrubber reads the pending destination from the same browse owner, including its
ready phase, rather than inferring arrival from visible-range, total or loading changes.
When ownership ends, ordinary visible-position sync resumes. Pointer dragging retains
local immediate feedback; it does not own asynchronous navigation completion.

Without a pending destination, the existing settled-density rules apply:

1. **Unmount save:** `useScrollEffects` cleanup captures the focused image's
   viewport-relative ratio: `(rowTop + headerOffset - scrollTop) / clientHeight`.
   Stored as module-level state (not React state — survives component swap).

2. **Mount restore:** New component's mount effect reads the saved ratio,
   waits two `requestAnimationFrame`s (for ResizeObserver + virtualizer
   measurement), computes `scrollTop = rowTop + headerOffset - ratio × clientHeight`,
   and applies it directly to the DOM.

3. **Edge clamping:** If the image would be partially off-screen (ratio puts
   it behind the sticky header or below the viewport), it snaps to the
   nearest edge — fully visible.

4. **Drift prevention:** `cancelWindowMaintenance()` cancels maintenance and sets a
   2-second cooldown before the restore, preventing `extendBackward` → prepend
   compensation → browser scroll clamping → pixel loss on each cycle.

Initial ordinary/AI reads use a separate search-owned controller. A newer search
cancels prior search, browsing and range work; density cancels maintenance only, so the pending
search still publishes its requested query/order and settles its own lifecycle.
Explicit browsing, including scrubber and keyboard-edge intent, may supersede an
ordinary initial read; automatic viewport refill does not. If navigation invalidated the resident
page, Home rebuilds the current-order first page before reusing it. Home can reuse
a valid resident first page; AI searches own their finite result pool.
Small-result fill captures the current range signal when it starts and remains
cancellable during density restoration. Adapter cancellation outcomes are not
normalized into successful core-list absence.

Browsing uses a separate cancellation signal and retains ready placement until a
view consumes it. A cancelled refill without a successor settles its own busy state;
its success or cancellation cannot settle a pending search. Newer cursor restore or
snap-back cancels obsolete browsing, and cancelled snap-back cannot clear a retained
or newer focus. These owners are not a universal cancellation epoch.

Saved restoration belongs to its captured search generation and saved record.
While its two frames are pending, short-lived input listeners observe actual list
scroll/navigation intent. Home/End follow capture-phase handling; other navigation
keys must reach the document in bubble phase. No-op grid Left/Right, table
Left/Right and keys consumed by another control do not cancel vertical placement.
New search or superseding input discards only the owned saved state.

Fresh columns, header/viewport measurements and buffer-origin changes still use
the original global anchor with current geometry. Unmount cancels frames and input
listeners without prematurely consuming the saved record, preserving Strict Mode
peek-until-applied behavior. Initial mounting without saved density state retains
its separate fallback path; it is not covered by this saved-record ownership rule.

---

## §4 Swimming, Timing, and Limits

### Buffer Movement and Visible Stability

Fixed-grid buffer movement and variable-layout repacking are different sources of
visible displacement. Under the [fixed-row policy](#fixed-row-window-policy),
buffer-local Grid maintenance translates rows without regrouping images. Indexed fixed rows use global
slots and do not need origin compensation; the data buffer still evicts normally.
This does not rule out Justified boundary repacking or media-arrival effects in
indexed mode. See the [separate evidence](../scroll-horizons-thumbs-and-blocking.md).

When `extendBackward` prepends 200 items to the buffer (in seek or scroll mode):

1. React re-renders with 400 items (200 new + 200 existing).
2. The virtualiser grows — new rows appear above the viewport.
3. `useLayoutEffect` adjusts `scrollTop` by the change in global row origin,
   using the pre-publication scroll position.
4. **The contract of `useLayoutEffect`:** runs after DOM mutation, before
   browser paint. So the compensation should be invisible.

Layout compensation is not a universal paint guarantee. The virtualizer can require
additional rendering work, and a stable DOM box does not establish decoded media or
every compositor frame. Retained-box geometry and current-image readiness are
separate contracts.

### Initial Headroom: Bidirectional Seek

Deep seek paths fetch backward items (halfBuffer ≈ 100) in addition to the
forward fetch (PAGE_SIZE = 200). The combined buffer contains about 300
items. The user's viewport lands in the middle, with about 100 items of
headroom above. This reduces immediate boundary pressure after landing; subsequent
maintenance still needs stable geometry and compensation. Finite headroom cannot
guarantee that delayed arrivals always occur outside the viewport.

### The timing chain (seek and scroll modes)

Bidirectional seek eliminated swimming, but the timing chain still serves
two purposes: (1) preventing extends from racing against the buffer
replacement during seek, and (2) spacing out consecutive prepends so each
`scrollTop` compensation settles before the next fires.

In indexed scroll mode, prepend compensation is disabled. The timing chain
only applies to seek cooldowns (preventing extends from racing against
seek-triggered buffer replacements).

```
seek() called
  ├── _seekCooldownUntil = Date.now() + 100ms     ← blocks ALL extends
  ├── ES fetch (async, ~100–500ms)
  ├── set() — buffer replaced, _seekGeneration++
  │
  ├── Effect #6: reverse-compute scrollTarget       ← zero flash
  │     └── setTimeout(150ms) → synthetic scroll
  │
  ├── 100ms: cooldown expires
  ├── 150ms: deferred scroll fires
  │     ├── reportVisibleRange → extendForward
  │     └── reportVisibleRange → extendBackward     ← first prepend
  │           ├── ES fetch (async)
  │           ├── set() — buffer grows, _prependGeneration++
  │           ├── useLayoutEffect: scrollTop += compensation
  │           └── _seekCooldownUntil = Date.now() + 50ms   ← POST_EXTEND_COOLDOWN
  │
  └── 200ms+: next extend can fire (50ms after previous)
```

**Key constants** (in `tuning.ts`):

| Constant | Value | Purpose |
|---|---|---|
| `SEEK_COOLDOWN_MS` | 100ms | Post-arrival extend block — virtualiser settles |
| `SEEK_DEFERRED_SCROLL_MS` | 150ms | = cooldown + 50ms — first extends fire in stable state |
| `POST_EXTEND_COOLDOWN_MS` | 50ms | Spaces out consecutive backward extends |
| `SEARCH_FETCH_COOLDOWN_MS` | 2000ms | Blocks extends during in-flight search/abort |

### Cost model

Each seek path makes a different number of ES round-trips:

| Path | Request shape | When |
|---|---|---|
| Shallow from/size | One offset page | Fetch start below `DEEP_SEEK_THRESHOLD` |
| End key fast path | One reverse page | Requested position near the result end |
| Position-map seek | Exact cursor lookup; forward/backward pages in parallel | Eligible total with a loaded position map |
| Percentile (deep date/numeric) | Profile lookup, cursor page, backward context and rank | Estimated deep landing |
| Keyword composite (deep keyword) | Composite pages, cursor page and rank; possible binary refinement | Keyword landing without an indexed cursor |
| Null-zone seek | Distribution lookup, filtered cursor pages and rank | Landing in the missing-value tail |

Position-map seek uses exact cursor lookup, parallel forward/backward
`search_after` via `Promise.all`, and no `countBefore` because the map supplies
the offset. Delivery time depends on topology, cache state and server work.

Ordinary extension uses a cursor-page request; crossing a null/value boundary or
recovering an expired PIT can require additional reads.
Sort-around-focus is 2–4 round-trips (getById + countBefore + optional
bidirectional search_after). When the position map is loaded, sort-around-focus
skips `countBefore` (the map already knows the image's global offset).
Scrubber interactions request the relevant sort distribution. Calls for the same
query/sort share pending work and reuse the completed cache. A different request
scope or new search cancels the old request; superseded results cannot publish or
clear newer work. Null-zone requests have their own pending slot and include the
missing primary field and uploadTime direction in their identity. Rejected or
aborted work can be retried. Primary-null responses can be cached; null-zone absence
is retryable.

Deep keyword seeks bypass raw-primary percentile estimation. A cached keyword
bucket still uses a valid uploadTime percentile scoped to that bucket; absent or
incomplete bucket coverage uses the composite fallback. Width and height also have
distribution descriptors, but remain numeric primary-estimation paths, as do dates.

### Bounded justified geometry costs

For a buffer of N images, dimensions are bounded by N+94 and each ID map by N. At default
capacity 1,000, up to 22 known technical blocks intersect the buffer. Unknown full, non-final
indexed blocks share one square estimate, created only on first use within that construction.
Builds without eligible blocks do not create it; subsequent constructions never reuse it.
Known and true-final blocks are packed independently. Indexed block descriptors are O(ceil(total/48)), up to 1,355 at
the default 65,000 threshold. Virtualizer storage is O(row count), with high-water capacity.
Mounted old/new layouts, temporary seek geometry and committed dimension snapshots can
coexist: the dimension bound is not an aggregate heap bound on JS, typed arrays and WASM.
Resident/indexed thresholds (1,000/65,000) and buffer capacity (1,000) remain configurable.

At most three trailing suffix searches each evaluate m(m+1)/2 intervals: conservative
bounds are 3,528 per affected block and 81,144 per default-capacity construction. Full
endings exit early. Construction occurs on publication/reflow; ordinary scroll renders
reuse layout. Rebuilding intersecting blocks, measuring from zero and preparing temporary
seek geometry can amplify that work, but these are static bounds and hypotheses, not
measured jank or leaks. Prefer removing demonstrated redundant work or narrowing
invalidation before introducing caches or prefix-tree representations.

Seek, indexed and resident regimes have different geometry costs. Fixed-duration
frame sampling is not action latency; geometry readiness is not decode readiness. Page
size/capacity and held maintenance checks do not prove natural-scroll request frequency.
If a selected refactor needs that evidence, attribute starts/completions/cancellations and
outstanding work by direction through forward eviction and reverse prepend. Do not infer
amplification from buffer bounds alone or enlarge reads/retention to improve measurements.
See the [performance handbook](../../../e2e-perf/README.md#density-comparisons-and-thumbnail-exposure)
for matched-condition requirements; campaigns remain operator-approved work.

### When this architecture breaks

The approach has limits determined by data distribution, backend capabilities and
the selected coordinate regime:

**Percentile estimates at extremes.** A percentile estimate can land far from the
requested rank, particularly with skewed distributions or near the tails.
`countBefore` locates the returned window; it does not turn an approximate seek
into a guarantee of the requested exact rank. Backward context provides finite
headroom around the landing. Indexed position-map lookup uses exact stored cursors
instead of percentile estimation.

**`countBefore` on heavily skewed data.** `countBefore` is a single
`_count` query — fast regardless of depth. But the compound boolean query
it constructs (multi-clause range + term) can be slow if ES needs to
evaluate it against a very large number of tied values. With 400k docs
sharing the same credit "PA", the tiebreaker clause (`id < "abc..."`) is
doing work. Latency depends on the distribution and backend execution, not depth alone.

**Keyword composite walk at extreme cardinality.** `findKeywordSortValue`
pages through a composite aggregation (1000 buckets per page). At 100k+
unique values this is 100+ pages × ~50ms = 5 seconds. Current fields peak
at ~50k unique values (credit). A field with 1M+ unique values would need
a different strategy (e.g. terms aggregation with min_doc_count, or
percentile on the keyword's hash).
(Only applies to seek mode — indexed scroll mode bypasses composite walks
entirely via position-map cursor lookup.)

**`search_after` cursor invalidation.** If the underlying data changes
between the forward and backward fetches of a bidirectional seek (document
deleted, re-indexed with new sort values), the cursors can become
inconsistent. PIT provides snapshot isolation on non-local ES, but PIT
keepalive is only 1 minute. A user who leaves the tab for >1 minute and
then seeks will get a PIT expiration, fall back to non-PIT mode, and
potentially see a small cursor inconsistency. Graceful degradation, not
a crash — but the buffer might have a gap or duplicate near the cursor
boundary.

**The id tiebreaker assumes uniform distribution.** The binary search
refinement (§5) works because SHA-1 hashes are uniformly distributed in
hex space. If image IDs were ever changed to sequential integers or
UUIDs-v7 (time-sorted), the binary search would degenerate. The hex
interpolation would overshoot or undershoot systematically. Fix: detect
the ID format and switch to linear interpolation for sequential IDs.

### Buffer corruption defence

Five layers protect against stale data from racing extends:

1. `abortExtends()` before scroll reset (primary).
2. `search()` sets a 2-second extend cooldown.
3. Seek cooldown refreshed at data arrival.
4. Abort check before PIT-404 retry in `es-adapter.ts`.
5. `abortExtends()` exposed on the store for imperative callers.

The [buffer-corruption suite](../../../e2e/local/buffer-corruption.spec.ts)
checks publication ownership across resets, query changes and pending reads.

### PIT lifecycle

Point In Time (PIT) provides consistent pagination on non-local ES:

- Opened on first search, reused for extends and seeks.
- 1-minute keepalive.
- Generation counter (`_pitGeneration`): seek/extend capture the
  generation at call start; if `search()` opened a new PIT mid-flight,
  they skip the stale PIT (avoids 404 round-trip).
- 404/410 fallback: retries without PIT. Graceful degradation at the
  cost of snapshot isolation for that single request.

The position map fetch opens its own **dedicated PIT**, fully decoupled
from the main search PIT. This prevents the 2–5 second background fetch
from interfering with user-initiated seeks or extends.

### Image detail position restore

When the user reloads the page while viewing image detail at a deep offset,
the offset cache (`sessionStorage`) stores both the numeric offset AND the
`search_after` cursor. `restoreAroundCursor` uses bidirectional cursor reads around
the selected current target tuple, retaining session coordinates and total.
Cursor/read failure falls back to existing approximate seek; a genuinely missing
image can remain standalone, so exact landing is not a universal guarantee.
`_cursorRestore` exposes the existing image/generation/signal across cursor,
cursorless and fallback work; detail remount joins it instead of restarting reads.
Search, cancellation and successor seek retire obsolete descriptors. Captured
focus intent separately guards late focus/placement while useful data may publish.
An early close retains its return target until publication permits placement,
without a second loading path; see [the detail-return contract](../../../src/lib/detail-return.ts)
and [ledger unit](../zz%20Archive/not-yet-another-audit-ledger.md#detail-return-unit).

---

## §5 Deep Seek — How We Random-Access Without Random Access

ES `search_after` is sequential — it can only go forward from a known
cursor. There is no "give me the document at position 500,000" API. The
strategy depends on the tier.

### Decision tree

```
seek(globalOffset)
  │
  ├─ offset + PAGE_SIZE >= total?
  │   └── YES: End key fast path — reverse search_after, no cursor
  │
  ├─ positionMap available? (1k < total ≤ 65k)
  │   └── YES: Position-map fast path
  │         1. cursorForPosition(posMap, offset) → exact search_after cursor
  │         2. Parallel forward + backward fetch (Promise.all)
  │         3. No countBefore needed (offset is exact from the map)
  │         4. Saves 2-13 ES calls vs other deep-seek paths
  │
  ├─ offset < DEEP_SEEK_THRESHOLD (10k)?
  │   └── YES: Shallow seek — plain from/size
  │
  ├─ Position is in null zone? (docs missing the sort field)
  │   └── YES: Null-zone seek
  │         1. Use null-zone uploadTime distribution for position→date mapping
  │         2. Filtered search_after (must_not: exists: {field})
  │         3. countBefore with null-zone awareness
  │
  ├─ Sort field is date or numeric?
  │   └── YES: Percentile estimation path
  │         1. percentile = (offset / coveredCount) × 100  (adjusted for
  │            direction; uses coveredCount, not total — see below)
  │         2. ES percentiles agg → estimated sort value
  │         3. search_after([estimated_value, ""])
  │         4. countBefore → exact landed offset
  │
  └─ Sort field is keyword?
      └── YES: Cached bucket or composite lookup, without a raw keyword percentile
            1. If the cached distribution covers the target, estimate uploadTime
               within that bucket and construct the full keyword/uploadTime/id cursor
            2. Otherwise findKeywordSortValue walks composite pages to locate the
               bucket, then constructs a direction-aware full seek cursor
            3. search_after + countBefore → exact landed offset
            4. The composite fallback may refine large-bucket drift using the
               existing id-tiebreaker binary search
```

The first three paths (End key, position map, shallow) give exact offsets
and use `targetLocalIndex` directly for scroll positioning. The remaining
paths (null-zone, percentile, keyword) produce approximate offsets and use
reverse-computation from the user's current `scrollTop` to eliminate flash.

### The position-map fast path

When the position map is available (1k < total ≤ 65k), seek is trivial:
look up the sort values at the target position in the map, issue
`search_after` with those exact values. One network call for the forward
fetch. Both the forward and backward cursors are known upfront from the
map, so they run in parallel via `Promise.all` — saving ~250-350ms
compared to the sequential fallback.

The position map eliminates `countBefore` entirely (the offset is already
exact), eliminates percentile estimation (no approximation needed), and
eliminates composite aggregation walks (no bucket-walking for keyword
sorts). It handles date, keyword, and null-zone sorts uniformly — the map
stores whatever sort values ES returned, including nulls.

### Percentile estimation (seek mode, >65k)

For date-sorted views (the common case), ES's `percentiles` aggregation
can estimate the sort value at any percentile of the distribution in O(1)
— it uses a TDigest sketch, not a scan. We convert the target offset to a
percentile, ask ES for the value, and `search_after` from there.

**Accuracy:** Percentile estimation is approximate (TDigest has ~1–5% error
at extremes). We compensate with `countBefore` — a single `_count` query
that tells us exactly where we landed. The user never sees the estimation
error; it only affects which 200-item window we load.

**`coveredCount` correction:** The percentile denominator uses `coveredCount`
(docs *with* the sort field), not `total`. For fields where many docs have
null values (e.g. `dateTaken` — 80% null), using `total` would compress the
non-null distribution to a thin band. The sort distribution's `coveredCount`
is fetched (and cached) on first scrubber interaction.

### Binary search on SHA-1 hex (seek mode, >65k)

When sorting by keyword (e.g. Credit), a single bucket can contain 400k+
docs (all with credit "PA"). After landing at the bucket start via
composite aggregation, we need to refine within the bucket to reach the
target offset.

Image IDs are 40-character SHA-1 hashes — uniformly distributed in hex
space. We binary search on the first 12 hex characters (~48 bits):

```typescript
let loNum = 0;
let hiNum = 0xffffffffffff; // 12 hex f's
for (step 0..50) {
  midNum = floor((loNum + hiNum) / 2)
  mid = midNum.toString(16).padStart(12, "0")
  probeCursor = [keywordValue, ..., mid]  // tiebreaker is always last
  count = countBefore(params, probeCursor, sortClause)
  if (count <= target) loNum = midNum else hiNum = midNum
  if (|count - target| <= PAGE_SIZE) break  // close enough
}
```

Each iteration is a single `_count` query (~5–10ms). Convergence in ~11
steps. Total: ~100ms + network. Compared to the brute-force skip loop
that preceded it (5 × `search_after(size=100k)` = ~50MB transfer, ~46s
over SSH tunnel), this is a 99.99% network reduction.

### `countBefore` — the universal position finder (seek mode)

`countBefore(params, sortValues, sortClause)` answers: "how many documents
sort before this cursor?" It constructs a compound boolean query:

```
For sort [uploadTime desc, id asc]:
  cursor = [1711036800000, "abc123"]

  count = docs where:
    (uploadTime > 1711036800000)  ← strictly before in desc order
    OR (uploadTime == 1711036800000 AND id < "abc123")  ← same value, tiebreaker
```

This is a single `_count` query — O(1) regardless of depth. It's how we
convert any cursor into an exact global offset, and vice versa. In indexed
scroll mode, `countBefore` is rarely needed — the position map provides
exact offsets directly.

**Null-zone awareness:** When the sort field is missing (`null`), ES sorts
these docs to the end. `countBefore` adds an `exists` filter to count
non-null docs separately, then adds the within-null-zone count using the
uploadTime fallback sort. This is the `detectNullZoneCursor` /
`remapNullZoneSortValues` helper pair.

---

## §6 The Scrubber

The scrubber is a custom scrollbar that replaces the native one. It serves
as both a scroll position indicator and a random-access seek control.

### Coordinate system

Everything — thumb, ticks, tooltip, click-to-seek — uses the same mapping:

```
ratio  = position / maxPosition
pixel  = round(ratio × maxThumbTop)
```

Where `maxPosition = total − visibleCount` (native scrollbar semantics)
and `maxThumbTop = trackHeight − thumbHeight`. The reverse mapping
(`positionFromY`) uses the same denominator so pointer and displayed positions
share one coordinate system.

### Three modes

| | Scroll mode | Indexed scroll mode | Seek mode |
|---|---|---|---|
| **When** | `total ≤ SCROLL_MODE_THRESHOLD` (1000) | `1k < total ≤ POSITION_MAP_THRESHOLD` (65k) | `total > 65k` |
| **Data coverage** | All results in buffer | Position map (ids + sort values) for all; buffer (full `_source`) for ~1000 | Windowed buffer (~1000 of total) |
| **Virtualizer count** | `results.length` (buffer-local) | `total` (global — full scroll height, stable from frame 1) | `results.length` (buffer-local) |
| **Drag interaction** | Directly scrolls content (real-time) | Directly scrolls content (real-time); skeletons for positions outside buffer | Moves thumb + tooltip only |
| **Release** | No-op (already scrolled) | No-op (already scrolled; buffer slides to fill via extends/seeks) | `seek(position)` → buffer replaced |
| **Activation** | Immediate after two-phase fill | Immediate (twoTier from total); position map loads in background (~2-5s) for faster seeks | Immediate |
| **Latency** | 0ms (local scroll) | 0ms for in-buffer; ~200-450ms for scroll-triggered seek | 200–500ms (ES round-trip) |

Scroll mode uses `_fillBufferForScrollMode()` — a two-phase fetch:

1. **Phase 1:** The initial `search()` fetches `PAGE_SIZE` (200) items as
   normal. Results appear on screen in ~100ms. At this point the scrubber
   is still in seek mode (buffer covers only 200 of, say, 800 items).
2. **Phase 2:** Immediately after phase 1, if `total ≤ SCROLL_MODE_THRESHOLD`
   (env-configurable, default 1000), the store eagerly fetches all remaining
   items in `PAGE_SIZE` chunks via `search_after`. When the buffer contains
   the full result set, the scrubber transitions to scroll mode — typically
   ~200–500ms after the initial search.

The user never waits for phase 2 — they see results instantly and gain
smooth scroll-mode interaction a fraction of a second later.

Indexed scroll mode uses `_fetchPositionMap()` — a background fetch:

1. After the initial search, if `SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD`,
   `twoTier` is immediately true (derived from total, not from positionMap).
   The virtualizer count is set to `total` from frame 1, giving the scroll
   container its full height. The scrubber operates in scroll mode — drag
   directly scrolls the content, showing skeletons for positions outside
   the buffer. Scroll-triggered seeks reposition the buffer within ~1-2s.
2. In parallel, the store fetches a lightweight `[id, sortValues]` index
   for all results using `_source: false` in 10k-doc chunks via a
   dedicated PIT (~2-5s).
3. Before the position map loads, seeks use the standard deep-seek paths
   (percentile estimation, composite walk, etc.). After it loads, seeks
   use the fast position-map path (exact cursor lookup, parallel fetch,
   no `countBefore`). The scrubber mode label transitions from `'seek'`
   to `'indexed'`, but the user-facing behaviour is identical — drag
   already scrolled the content directly from frame 1.

### Tick marks and density map

Ticks come from ES histogram distributions. For date sorts, the store
fetches a `date_histogram` aggregation with adaptive interval selection
(month / day / hour / 30m / 10m / 5m). Each bucket becomes a tick placed
at its **cumulative doc count position**, not at its time value.

This is a deliberate design decision: tick spacing functions as a **density
map**. Dense regions (many docs per time/keyword bucket) produce closely
packed ticks — the track is dominated by these regions. Sparse regions are
compressed into thin bands with few, widely-spaced ticks. The visual tick
density mirrors the data density, telling the user at a glance where
content is concentrated. The scrubber is simultaneously a position
indicator, a seek control, and a miniature density histogram of whichever
field the results are sorted by.

Label decimation prevents overcrowding: major labels shown first (≥18px
spacing), then minor labels fill remaining gaps. The result adapts
naturally to any track height or data distribution.

### Sort distribution cost

Tick data comes from ES aggregations (date histogram or composite terms).
Date histograms cost 10–50ms; keyword composites up to ~500ms for
high-cardinality fields. Distributions are lazily fetched on first
scrubber interaction, cached by query+sort key, and aborted on
supersession. Full guard details in `scrubber-ticks-and-labels.md`.

### Sort-context tooltip

The tooltip shows the sort field value at the hovered position plus a
human-readable `"X of Y"`. For date sorts, `formatSortDateAdaptive`
adapts granularity based on the total time span:

| Span | Format | Example |
|------|--------|---------|
| ≥28 days | Day Month Year | `1 Aug 2025` |
| <28 days | Day Month Time | `3 Apr 15:30` |
| Viewport >28 days | Month Year | `Aug 2024` |

For keyword sorts, an O(log n) binary search over the pre-fetched keyword
distribution resolves position → keyword value with zero network during
drag.

### Null zone

When sorting by a field with missing values (e.g. `dateTaken` — 80% of
1.3M docs lack it), docs without the field sort to the end. The region
past the last doc with a value is the **null zone**:

- **Red boundary tick** with a vertical "No {field}" label.
- **Red-tinted ticks** from a separate, universal fallback, uploadTime distribution (fetched
  with `must_not: exists: {field}` filter).
- **Italic tooltip**: "Uploaded: {date}" instead of "Taken: {date}".
- **Null-zone seek**: filtered `search_after` narrowed to missing-field
  docs, using the null-zone distribution for direct position→date mapping.

---


## File Map

| File | Lines | Role |
|---|---|---|
| `stores/search-store.ts` | ~3.2k | Buffer management, seek (5 strategy paths incl. position-map fast path + parallel fetch), extend, sort-around-focus, PIT lifecycle, position map background fetch |
| `hooks/useScrollEffects.ts` | ~910 | All scroll effects: compensation (gated off in indexed scroll mode), seek scroll-to-target, density-focus, sort-focus. `isTwoTierFromTotal()` + `toVirtualizerIdx()` helpers for index-space conversion. |
| `hooks/useDataWindow.ts` | ~430 | Buffer-aware view interface, edge detection, extend triggers, two-tier mode (`virtualizerCount=total`, scroll-triggered seek) |
| `components/Scrubber.tsx` | ~1.17k | Three-mode control (scroll/indexed/seek), coordinate mapping, tick rendering |
| `lib/sort-context.ts` | ~1k | Tooltip labels, tick generation, distribution lookup |
| `lib/scroll-container-ref.ts` | ~70 | Observable scroll container ref — generation counter + `useSyncExternalStore` hook. Scrubber subscribes to detect container changes across density switches. |
| `dal/position-map.ts` | ~80 | `PositionMap` type, `cursorForPosition()` helper |
| `dal/es-adapter.ts` | ~1.3k | ES queries: searchAfter, countBefore, estimateSortValue, distributions, fetchPositionIndex |
| `constants/tuning.ts` | ~177 | All timing constants, buffer sizing, thresholds (`POSITION_MAP_THRESHOLD`, `SCROLL_MODE_THRESHOLD`) |
| `constants/layout.ts` | ~27 | Pixel constants (row heights, cell widths) |

---

## Glossary

| Term | Meaning |
|---|---|
| **Buffer** | Dense array of ~1000 `Image` objects. `buffer[0]` corresponds to global position `bufferOffset`. |
| **`BUFFER_CAPACITY`** | Max buffer size (1000). Eviction trims from the opposite end when exceeded. |
| **`countBefore`** | Single `_count` query that returns the exact global offset of any cursor. O(1). Used in seek mode; skipped when position map is available. |
| **Cursor** | ES `search_after` sort values tuple. Stored at buffer start (`startCursor`) and end (`endCursor`). |
| **Density** | A viewing mode (table, grid, detail, fullscreen) — conceptually a zoom level of the same ordered list. |
| **Extend** | Fetch a page and append/prepend to the buffer. Forward = append + evict start. Backward = prepend + evict end. |
| **`EXTEND_THRESHOLD`** | How close to the buffer edge (50 items) before `reportVisibleRange` triggers an extend. |
| **Indexed scroll mode** | The middle tier (1k–65k results). `twoTier` active (from total range), virtualizer spans `total`, scrubber drag = direct scroll, buffer slides via extends and scroll-triggered seeks. Position map loads in background for faster seeks. |
| **"Never Lost"** | The principle that focus, scroll position, and context survive every transition. |
| **Null zone** | Region of results where the sort field is `null`. Sorted by `uploadTime` fallback. |
| **`PAGE_SIZE`** | Items per fetch (200). Used by seek, extend, and scroll-mode fill. One constant for all paths. |
| **PIT** | ES Point In Time — lightweight index snapshot for pagination consistency. |
| **Position map** | Lightweight index: `[id, sortValues]` for every result (1k–65k). ~288 bytes/entry. Enables exact cursor lookup and two-tier virtualisation. |
| **Reverse-compute** | In seek mode: instead of setting `scrollTop` to the target, compute the target index that matches the user's *current* `scrollTop`. Eliminates flash. |
| **Scroll mode** | The simplest tier (≤1,000 results). All data in buffer. Scrubber is a plain scrollbar. |
| **Seek** | Clear buffer, refill at target global offset. Triggered by scrubber (seek mode) or scroll-triggered reposition (indexed scroll mode). |
| **Seek mode** | The fallback tier (>65k results). Scrubber drag previews position; release triggers seek. |
| **Swimming** | Unsolicited visible content displacement during maintenance or repacking. Fixed-row origin compensation applies to buffer-local windows; variable-row boundary changes are a separate mechanism. |
| **`twoTier`** | Boolean derived from total range (`SCROLL_MODE_THRESHOLD < total ≤ POSITION_MAP_THRESHOLD`). When true, indexed scroll mode is active — indices are global, virtualizer spans `total`. Stable from frame 1 (not dependent on position map loading). |
