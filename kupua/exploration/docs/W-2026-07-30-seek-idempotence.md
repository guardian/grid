# Wandering findings — 2026-07-30 seek idempotence (M7)

**Bed:** local (10,102-doc sample corpus), seek tier forced via
`VITE_POSITION_MAP_THRESHOLD=0` (`:3030`).
**Query:** `credit:Avalon` (`nonFree=true`) — ~2,130 docs, same corpus used for M10
this session.
**Focus mode:** default (not forced; not implicated in this finding).

## Summary

Mission M7 asked: seek to the same scrubber position via different routes
(drag from one side vs the other, click, keyboard) — do they agree? The
session's original hypothesis (asymmetric bidirectional-seek code paths) was
refined into what looked like a cleanly isolated bug (F1, below) — but a
post-write-up re-check found F1 itself was a **test-methodology artifact**
(stale `sessionStorage` from reusing the same page across the whole session),
not a real product bug. **F1 is retracted.** Re-running the actual
route-comparison mission properly (storage cleared per test point) found a
real but smaller, medium-confidence effect instead: **the same target pixel,
reached via a plain click vs. a drag starting from above vs. a drag starting
from below, lands 1–3% apart** (F2, below) — reproducible, but the exact root
cause is inferred from source rather than directly instrumented.

---

## F1 (RETRACTED — see Correction below) — First scrubber interaction after a
fresh page load lands on a biased position; the identical click afterwards is
accurate

**Oracle:** 7.2 self-consistency (the same click coordinate, on the same page,
should give the same result regardless of interaction history)
**Confidence:** high — reproduced 3 times, geometry confound explicitly ruled out
**Bed:** local, seek tier (`:3030`), `credit:Avalon` (total 2,130)

**Repro**
1. Fresh `page.reload()` / navigation to the query above. Wait for
   `loading === false`.
2. Click the scrubber track at the exact midpoint of its bounding box (ratio
   0.5 → the pixel this maps to is `track.top + 0.5 * track.height`).
3. Read the resulting `bufferOffset` / anchor image's global position /
   `aria-valuenow`.
4. **Without reloading**, click the *same* pixel coordinate again (or click
   elsewhere first, then click it again).

**Expected (per oracle):** the same click, at the same pixel, on the same page,
in the same layout state, should always compute the same target position — the
scrubber's `positionFromY` math (`track top/height`, thumb height, visible-count)
is purely geometric and has no reason to depend on interaction history.

**Observed:** the very first click after a fresh load consistently landed at
anchor global position **1182** (`aria-valuenow` "1176") — reproduced 3 times
across independent fresh reloads, via three different interaction methods that
all funnel through the same geometry math (plain click, drag starting from the
top/position-0 thumb). The mathematically correct target for a ratio-0.5 click
on a 2,130-item set is **1065**. A *second* click at the identical pixel
coordinate on the same page (after any other scrubber interaction had already
happened once) landed at **1090** (`aria-valuenow` "1084") — within normal
rounding tolerance of the correct 1065. The bias is consistently in the same
direction (overshoot, ~110–115 positions, ~5% of total) and consistently only
present on the first interaction.

**Geometry confound explicitly ruled out:** captured `track`/`thumb`
`getBoundingClientRect()` values and the literal computed click `clientY` for
both the biased first-click and the accurate later click — track and thumb
bounding boxes were pixel-identical (`track: {top:72, height:813}`, `thumb
height: 20`) and the computed target `clientY` (478.5) was identical between
the two clicks. Since the pixel input and track/thumb geometry are provably the
same, the bias must originate in some other click-time input to `positionFromY`
(most likely the `thumbVisibleCount`/visible-items-per-viewport value it reads,
which may not yet be settled/measured correctly on the very first render/click
after a fresh load — not confirmed further, `__kupua_getVisibleImageIds__()`
read 0 both before and after in this session, suggesting that hook itself may
not be reliable on the seek tier, so this was not pursued further this session).

**User-facing impact:** a user who loads a large (seek-tier) search result and
immediately clicks the scrubber to jump somewhere will land up to ~5% of the
result set away from where they clicked — clicking again at the exact same
spot then lands correctly. Likely to read as "the scrubber felt a bit off the
first time" rather than an obvious bug, but is a real, measurable, reproducible
inaccuracy.

**What M7 as originally framed (drag-from-left vs drag-from-right, keyboard)
was NOT able to establish this session:** once the "first interaction" bias is
accounted for (i.e. comparing two *non-first* interactions targeting the same
position via different routes), whether drag-direction or route choice itself
introduces any further disagreement is still an open question — ran out of
session budget before re-testing routes with the first-click bias controlled
for. Left as a follow-up.

---

## Correction — F1 retracted: sessionStorage history-restore artifact, not a
product bug

**What triggered the re-check:** the user asked to dig deeper into F1 on a
real TEST cluster. Before doing that, a cheap sanity check was run locally:
does the bias still appear if the first click happens after a long settle
wait (4s) vs. immediately? Both gave the *same* biased result (1182),
ruling out render/layout-settle timing as the cause and prompting a second
look at page-reuse confounds already flagged (but not chased) in this doc and
in the M10 findings doc's own open question.

**Confound found:** kupua persists a history-restoration snapshot in
`sessionStorage` per search, keyed by query
(`kupua:histSnap:<uuid>` → `{anchorImageId, anchorOffset, viewportRatio, ...}`).
`sessionStorage` survives `page.reload()` / repeat `page.goto()` to the same
URL within the same tab (only cleared on tab/window close) — and this entire
session reused the *same* `:3030` page across M10 and M7 without ever clearing
storage between "fresh" reloads, despite the playbook's own pre-existing
warning ("Clear both between missions or you get false positives"). Every
"fresh" reload in the original F1 repro was silently restoring an older
anchor/viewport from a prior test point in the same session, not starting
truly cold.

**A/B re-test (this session, `:3030`, same query, same ratio-0.5 click):**

| Condition | 1st click result | 2nd click, same page |
|---|---|---|
| `sessionStorage`/`localStorage` **not** cleared before reload | 1182 ("biased") | 1182 |
| Storage **cleared** before reload | 1090 ("accurate") | 1090 |

Wait time before the first click (0ms vs 4000ms) made no difference in either
condition — the effect is 100% explained by whether a stale history snapshot
existed, not by timing or by "first vs. second interaction" as a special code
path. A `sessionStorage` dump of the contaminated run showed the smoking gun
directly: `kupua:histSnap:...` containing `anchorOffset: 1090` from an earlier
test point in this same session.

**Conclusion:** F1 is retracted. There is currently no evidence of a real
first-click bug. The route/direction comparison M7 originally asked for was
re-run properly (storage cleared per test point) immediately after this
retraction — see F2 below.

---

## F2 — Same target pixel, different route to it, disagree by ~1–3% (medium
confidence, mechanism plausible but not fully instrumented)

**Oracle:** 7.2 self-consistency (the same click coordinate on the scrubber
track should seek to the same position regardless of how the thumb got there)
**Confidence:** medium — reproduced exactly (2/2 trials, identical anchor image
both times) for each of 3 routes, with track/thumb geometry confirmed identical
across all routes; root mechanism is a plausible inference from source, not
directly instrumented (no debug hook exposes `thumbVisibleCount`/visible-range).
**Bed:** local, seek tier (`:3030`), `credit:Avalon` (total 2,130), storage
cleared before every reload this time (see Correction above).

**Repro:** on 3 independently fresh (storage-cleared) page loads, reach the
identical scrubber-track pixel (ratio 0.5, `clientY = track.top + 0.5 *
track.height`) via 3 different routes:
- **A — plain click** at that pixel.
- **B — drag from above:** grab the thumb at its fresh-load position (top,
  ~position 0) and drag down to the pixel.
- **C — drag from below:** first click near the bottom (ratio 0.95) to move
  the thumb there, then grab it and drag up to the pixel.

**Result** (`aria-valuenow` after each, total 2,130):

| Route | `aria-valuenow` | Δ vs. click |
|---|---|---|
| A — click | 1084 | — |
| B — drag from above | 1056 | −28 (−1.3%) |
| C — drag from below | 1088 | +4 (+0.4%) |

Each route's result was **exactly reproduced** on a second independent trial
(same anchor image id both times per route) — this isn't measurement noise.

**Geometry ruled out as the cause:** the thumb's rendered height was 20px
(`MIN_THUMB_HEIGHT`-clamped) at all three routes' starting points, and the
track bounding box was pixel-identical across all three fresh loads. Since
`positionFromY`/`positionFromDragY`'s pixel→ratio mapping depends only on
track/thumb geometry (which is identical here), the differing results must
come from the OTHER input to that formula: `total - visibleCount` (the
denominator `maxPos` in `Scrubber.tsx`). Back-solving the formula from the
observed results implies a `visibleCount` reading in the range of roughly
8–70 depending on route — a real, large spread for a value that's supposed to
represent "how many rows are visible in the viewport right now" (which
shouldn't vary that much for the same viewport size).

**Plausible mechanism (not confirmed via direct instrumentation):**
`positionFromDragY` (drag) captures `dragVisibleCount = thumbVisibleCount`
once at pointer-down and holds it fixed for the whole drag;
`positionFromY` (click) reads the live `thumbVisibleCount` at click time. Both
ultimately trace back to `useVisibleRange()` in `useDataWindow.ts`, which
starts at `{start: 0, end: 0}` (`visibleCount = 1`) until the grid virtualizer
has reported at least one real range, and is otherwise driven by whatever
range the virtualizer currently has rendered — which can genuinely differ near
the top of the list, near the bottom, and shortly after a fresh load (fewer
render frames elapsed) vs. after some scrolling/interaction has already
happened. Because this value is baked into the click/drag-release math as a
fixed denominator rather than re-measured at the actual moment of seek
commitment, the same nominal target pixel can compute a measurably different
global position depending on the route taken to it. **This was not verified by
directly reading `visibleCount`/`thumbVisibleCount` at each step** (no debug
hook exposes it) — the back-solved values above are inferred from the position
formula, not measured directly, hence medium rather than high confidence.

**User-facing impact:** modest. A ~1–3% seek-target discrepancy that depends on
drag direction/starting point would be very hard for a real user to notice
(the scrubber's own tooltip shows the *computed* target, so it's internally
"consistent" with itself — a user dragging from the top would see a tooltip
agreeing with wherever they released, they'd just never realize an identical
release pixel reached via a different route would have landed a couple percent
elsewhere). Lower severity than the retracted F1's apparent 5.5%, but still a
genuine, reproducible violation of "the same pixel always means the same
seek target" — worth a follow-up with direct `visibleCount` instrumentation
before treating it as confirmed enough to file as a product bug for fixing.

**What would raise this to high confidence:** add a temporary debug hook
exposing `useVisibleRange()`'s live value (or `thumbVisibleCount` inside
`Scrubber.tsx`), then repeat routes A/B/C reading that value immediately before
each click/pointer-down completes, to directly confirm (rather than infer) that
it differs between routes and by how much.

**Keyboard route not tested:** the original mission also asked about a
keyboard route. Seek-tier keyboard navigation (`useListNavigation.ts`) moves
focus/scroll by row or jumps to absolute start/end (Home/End) — it has no
primitive for "jump to an arbitrary mid-list global position" comparable to a
scrubber click, so a like-for-like keyboard comparison at this exact target
isn't meaningful without walking there row-by-row. Left out of scope rather
than forced into an apples-to-oranges comparison.

---

## Appendix — off-scope observations (max 10, one line each)

- Every full-page reload logs recurring `WebSocket connection ... failed` /
  `502 Bad Gateway` / CORS-blocked `media-collections` console errors — known
  environment noise, treated as noise per session precedent.
