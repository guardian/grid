# Wandering findings — 2026-07-31 focus as bookmark across tiers (M9)

> ## ✅ ACTIONED (31 July 2026)
>
> F3 and F4's shared root cause is fixed, tested, externally reviewed, and
> committed (`34c168e41`, "Fix sort-around-focus scroll clobbered by
> scroll-mode buffer top-up in buffer tier") — see
> `kupua/exploration/docs/changelog.md` (31 July entry) for the fix
> write-up. Tier scope below (buffer broken, two-tier/seek clean) is
> confirmed and reflected in the changelog/commit as final. Review findings
> archived at `zz Archive/R-2026-07-31-buffer-self-correcting-fix-review.md`.
>
> **One loose end, not re-verified:** the Continuation section below flags
> that keyboard-navigation-driven off-screen focus changes in buffer tier
> were never explicitly live-tested (only sort-toggle and neighbour-fallback
> triggers were). The fix targets the shared effect #8/#9 mechanism
> regardless of what triggers the `sortAroundFocusGeneration` bump, so this
> is very likely already covered — but it wasn't independently confirmed via
> a dedicated repro. Worth a quick follow-up check if keyboard-nav-driven
> scroll-loss is ever reported.

**Bed:** local (2,130-doc `credit:Avalon` sample corpus), single server `:3020`
(default, unforced thresholds: `VITE_SCROLL_MODE_THRESHOLD=1000`,
`VITE_POSITION_MAP_THRESHOLD=65000`). Tier crossing achieved by changing the
**query** (not by forcing thresholds per-server, unlike M10) — narrowing/widening
between `credit:Avalon` (2,130 docs, two-tier) and a subset of it (794 or 1,336
docs, both ≤ 1000 → buffer tier), so the same corpus naturally sits in a
different tier depending on the query text.
**Focus mode:** explicit (repo default).
**Oracle:** 7.4 documented invariants — `02-focus-and-position-preservation.md`
§2.2/§2.3, specifically: "Search context change → focused image survives if
present; else nearest surviving neighbour, scrolled to its new position; else
top."

## Summary

Mission M9 asked: does explicit focus survive a seek-far/seek-back round trip,
and does it survive a search-context change that crosses a tier boundary? The
baseline (seek far, seek back, no query change) behaves exactly as documented —
no finding. Crossing the tier boundary by **widening** a query (focused image
present in the new, larger result set) also behaves exactly as documented. But
crossing the tier boundary by **narrowing** a query, when the focused image is
*absent* from the narrower set, reveals a real bug: the engine correctly finds a
surviving neighbour and sets `focusedImageId` to it (the ID-matching half of
§2.3 step 5 works), but never scrolls the viewport to that neighbour's new
position — the user is left looking at the top of the list while focus is
silently anchored off-screen. Reproduced twice with different starting
positions and different neighbour IDs, then re-verified a third time with
proper poll-until-settled logic (ruling out a fixed-wait timing artifact).
Filed as **F3**, confidence **high**. The re-verification also narrowed the
root-cause theory: this is not a failure to *load* a buffer around a distant
neighbour, but a failure of the shared scroll-to-focus effect to scroll when
the target is off-screen within an already-fully-loaded buffer-tier result
set — see the "Re-verification" note under F3 for detail.

A follow-up test targeted the broader question this raised: is the missing
scroll specific to neighbour-fallback, or a general failure of that shared
effect? **Sort-order toggle** (no query change, no tier crossing, focus never
leaves the result set at all — just its position in the list changes) shows
the exact same symptom: the focused image is correctly found at its new,
re-sorted index and `sortAroundFocusGeneration` correctly bumps, but the
viewport never scrolls to it. Reproduced twice (both toggle directions,
different starting indices). Filed as **F4**, confidence **high** — and
arguably more significant than F3, since it's a direct, uncaveated violation
of §2.2's explicit-focus sort-order guarantee via an everyday user action,
not an edge-case tier-crossing narrow. F3 and F4 together point at a single
shared root cause in the scroll-to-focus effect itself
(`useScrollEffects.ts` §9), independent of whatever precedes it.

---

## Baseline — Seek far / seek back, explicit focus, no query change

**Oracle:** 7.4, "Seek: explicit focus persists as durable state; seeking back
restores it."
**Confidence:** high (positive result)
**Repro:** fresh load `credit:Avalon` on `:3020`, click a grid cell to set
explicit focus, scrubber-click to ~90% of the track, scrubber-click back to ~2%.
**Result:** `focusedImageId` unchanged throughout; after seeking back, the
focused cell is rendered in the DOM with its focus ring (`ring-2
ring-grid-accent`) and is within the viewport. No finding — matches the
documented guarantee exactly.

---

## Tier-crossing widen — focused image present in the superset

**Oracle:** 7.4, "Search context change: focused image survives if present →
stay on it."
**Confidence:** high (positive result)
**Repro:** fresh load `credit:Avalon keyword:zselect` (794 docs, buffer tier —
real, unforced threshold), focus the first cell, then edit the search box
in-app (see Methodology note below) to `credit:Avalon` (2,130 docs, two-tier —
a proper superset of the 794). This crosses the buffer→two-tier boundary.
**Result:** `focusedImageId` unchanged, `total` updated to 2130,
`survivedInResults: true`, cell rendered in the DOM. No finding.

---

## F3 — Neighbour-fallback finds the right ID but never scrolls to it

**Oracle:** 7.4 / `02-focus-and-position-preservation.md` §2.3 step 5: "First
surviving neighbour found → focus it, **scroll to its new position**."
**Confidence:** high
**Bed:** local, `:3020`, `credit:Avalon` (2,130, two-tier) narrowing to
`credit:Avalon keyword:zselect` (794, buffer tier) — crosses the two-tier→buffer
boundary.
**Focus mode:** explicit

**Repro (trial 1)**
1. Fresh load `credit:Avalon` (clear `localStorage`/`sessionStorage` first).
2. Scrubber-click to ~50% of the track (loads buffer around position 984 of
   2130).
3. Click a grid cell to set explicit focus — id `f669976c...` (confirmed via
   direct ES lookup to lack the `zselect` keyword, i.e. guaranteed absent from
   the narrower query).
4. In-app, edit the search box (see Methodology note) to
   `credit:Avalon keyword:zselect`.

**Expected (per oracle):** `f669976c...` is absent from the new 794-doc set, so
the engine should find the nearest surviving neighbour (from the cached
±10–20 buffer IDs) and scroll to *its* new position in the 794-list.
**Observed:** `focusedImageId` changed to a different, valid ID (`e41b25d7...`,
confirmed present in the new result set at index **391 of 794** — a genuine
mid-list neighbour, not a trivial top-of-list default). But `bufferOffset`
stayed at **0**, `scrollTop` stayed at **0**, and the focused cell was **not
present in the DOM** (`document.querySelector('[data-image-id="..."]')` found
nothing). The user is shown the top of the 794-doc list while focus silently
points to an image ~49% of the way down, completely off-screen.

**Repro (trial 2, different starting position, independent confirmation)**
Same steps, scrubber-click to ~25% instead of 50% (buffer around position 440).
Focus target `c6101ac2...` (confirmed lacking `zselect` via ES). After the same
narrowing edit: `focusedImageId` became `21d011ab...`, present at index **191 of
794** (~24% down — again proportionally sensible, not top-of-list), but
`bufferOffset: 0`, cell not rendered. Identical failure mode.

**Expected (per oracle):** anchor scrolled to its new position (~index 191 or
391).
**Observed:** anchor set correctly by ID, but viewport left at position 0/top —
the "scroll to its new position" half of the documented step is not happening.

**User-facing impact:** a user who narrows a search around roughly where they
were looking, when their exact focused image doesn't survive the narrower
query, is shown the *top* of the new result list with no visual indication that
focus actually jumped somewhere else in the list. If they then press an arrow
key or `Enter`, the app will act on the invisible off-screen focus (e.g.
"snap back" navigation per §2.4's keyboard-from-distant-viewport behaviour, or
opening a detail view for an image the user cannot see and didn't intend to
select) — which will look like the wrong thing happened for a click they don't
remember making.

**Scope note (not fully characterized):** both narrowing trials happened to
cross the two-tier→buffer boundary, since that's M9's mission. Whether this
same scroll-omission also occurs for a search-context-change narrowing that
stays within a single tier (e.g. 2130 → 1336, both two-tier) was not conclusively
tested — an attempt to construct a same-tier repro ran out of budget finding a
correctly-absent focus target near the loaded buffer position. This is flagged
as an open question rather than pursued further; if it reproduces there too,
this is a general search-context-change bug rather than a tier-crossing-specific
one, which would be a slightly different (larger) blast radius.

**Evidence:** store state (`__kupua_store__.getState()`) before/after each
trial; DOM query for the focused cell; console clean (no errors during the
narrowing itself — the CORS/502 errors visible in some of this session's
snapshots are the collections-panel background fetch failing against a fake
`media-collections.test.dev-gutools.co.uk` host per the graceful-absence
directive, unrelated to this finding).
**Repro spec:** not written this session — see Continuation note below.

**Re-verification (same session, after a self-check):** reading
`_findAndFocusImage` in `search-store.ts` raised a concern that the original
trials used a fixed `waitForTimeout(1500)` and might have captured an
intermediate state of a multi-step async recursion rather than the true
settled state. Re-ran trial 1's scenario from a fresh browser tab with a
poll-until-settled loop (`sortAroundFocusStatus === null` and `loading ===
false` for 3 consecutive 250ms samples, up to 15s) instead of a fixed wait.
**Result: the bug is confirmed, not a timing artifact** — `focusedImageId`
settles correctly to the surviving neighbour (index 385 of 794) and stays
stable, but `bufferOffset` and the grid container's `scrollTop` both settle at
0, and the focused cell is confirmed absent from the DOM even after full
settlement.

This also refined the root-cause theory. The original suspicion (from reading
the source) was that the "outside current buffer" branch — which calls
`_loadBufferAroundImage` and explicitly sets a non-zero `bufferOffset` — should
have handled this case and was being missed by the short wait. That branch
**is not actually reached** in either trial: the narrower query's total (794)
is itself ≤ 1000 (buffer tier), so the destination search loads its *entire*
result set in one page (`results.length === total === 794`). Under
`_findAndFocusImage`'s `isInBuffer` check, an offset is "in buffer" whenever
it falls within `bufferOffset..bufferOffset+results.length` — which, when the
whole result set is already loaded, is trivially true for every offset. So the
neighbour is classified as already "in buffer," and the code takes the simple
branch (just set `focusedImageId` + bump `sortAroundFocusGeneration`) rather
than the buffer-loading branch. The bug is therefore narrower and more precise
than first filed: **the shared scroll-to-focused-image effect (the one that
reacts to a `sortAroundFocusGeneration` bump) does not scroll the viewport
when the newly-focused item is off-screen but already present in a
fully-loaded (buffer-tier) result set.** It is not about a failure to load a
buffer around a distant neighbour — no buffer load is needed or attempted
here; the loaded data already contains the target, only the scroll never
happens.

This raises (but does not confirm) a broader possibility: the bug may not be
specific to search-context-change/neighbour-fallback at all, and could
reproduce for *any* explicit focus change that lands on an off-screen index
within an already-fully-loaded buffer-tier result set (e.g. via keyboard
navigation or a programmatic focus call), not only via the narrowing-query
path. This is flagged as an open follow-up, not tested this session — see
Continuation.

---

## Methodology note — editing the CQL search box mid-session

The search input (`CqlSearchInput.tsx`, backed by a Guardian shared
ProseMirror-based web component) treats `Meta+a` + typing as editing *within
the currently-focused chip's value field*, not as replacing the whole query.
Typing `credit:Avalon keyword:zselect` as one continuous string after
select-all produces the single malformed chip `credit:"Avalon keyword:zselect"`
(zero results) — the space does not commit the first chip and start a new one.
The fix (also the one a real user would discover by trial and error): type the
first term, press **Enter** to commit it as a chip, then type the second term
and press Enter again. This reliably produces two separate chips and the
expected combined query. Recorded in the playbook for future sessions.

## F4 — Sort-order change: focus survives and is found, but the viewport never scrolls to it (no fallback, no query change, no tier crossing)

**Oracle:** `02-focus-and-position-preservation.md` §2.2, "Sort order change
(with explicit focus) | Focused image found in re-sorted results, scrolled to
its new position."
**Confidence:** high
**Bed:** fresh tab, `:3020`, single query throughout —
`credit:Avalon keyword:zselect` (794 docs, buffer tier). No query/filter
change, no tier crossing, no neighbour-fallback: the focused image is present
in the result set the entire time.

This follows directly from the F3 re-verification's open question ("is the
missing scroll specific to neighbour-fallback, or more general?"). Sort-order
toggle is the cleanest isolating case: the same 794-doc set stays loaded, the
focused image never leaves the result set (§2.3's neighbour-search machinery
never runs), only its *position within the list* changes because the whole
set gets re-ordered.

**Repro (trial 1)**
1. Fresh tab, load `credit:Avalon keyword:zselect`.
2. Scrubber-drag to ~50% to bring a mid-list cell into view.
3. Click a grid cell to set explicit focus — id `b0d9a2de...`, confirmed at
   index 376 of 794 (descending/default sort order).
4. Click the sort-direction toggle (descending → ascending), same query, same
   794-doc set.
5. Poll for settlement (`sortAroundFocusStatus === null`, `loading === false`,
   held for 3 consecutive 250ms samples), then wait an extra 1.5s margin.

**Expected (per oracle):** focused image found in the re-sorted list (its new
index, ~794-1-376=417, is the mirror position — a near-exact reversal, as
expected for an uploadTime-sort flip), and the viewport scrolls to keep it in
view.
**Observed:** `focusedImageId` unchanged (`b0d9a2de...`, confirmed present,
correctly re-indexed to 417 of 794 — the "found in re-sorted results" half of
the guarantee works). `sortAroundFocusGeneration` bumped from 0 to 1,
confirming the scroll-to-focus effect *did* fire. But the grid container's
`scrollTop` stayed at **0** and the focused cell was **not present in the
DOM**, even after full settlement plus an extra 1.5s margin. The user is
shown the top of the list with focus silently anchored 417 rows down.

**Repro (trial 2, independent — opposite toggle direction, different index)**
Same tab, scrolled back to top, re-seeked to ~20%, focused a different cell
(`bfbe8097...`) at index 132 (ascending order this time), toggled sort
ascending → descending. `focusedImageId` unchanged, correctly re-indexed to
661 of 794 (mirror position, `794-1-132=661`, exact match), generation bumped
2→... (to 2), same failure: `scrollTop: 0`, cell not in DOM, even after
settlement + 1.5s margin.

**Why this matters more than F3:** F3 requires a tier-crossing query
narrowing where the exact focused image happens to be absent from the new
set — a fairly specific scenario. This (F4) requires only toggling the sort
direction, an extremely common action with an explicit position-preservation
guarantee documented in plain terms in §2.2 with no caveats or "future
relaxation" framing (unlike the neighbour-fallback scenario, which at least
has some genuine documentation inconsistency around it — see the note in F3
comparing §2.2/2.3 against §4). F4 is a clean, direct, uncaveated violation of
a stated guarantee, reproduced twice with independent starting positions and
both toggle directions.

**Confirmed shared root cause with F3** (via temporary runtime instrumentation
— `window`-buffer logging added to `useScrollEffects.ts` §8/§9, reproduced
live, then reverted; no debug code remains in the codebase). A two-part race
between two `useLayoutEffect`s in `useScrollEffects.ts`:

1. **Effect #9 ("Sort-around-focus generation") fires too early**, before the
   buffer-window data for the new sort order has settled. Traced exact values
   for one repro: at the moment `sortAroundFocusGeneration` bumps and effect
   #9 runs, `imagePositions.get(focusedId)` still returned **376 — the item's
   *pre-sort* global index** (confirmed identical to the pre-toggle value),
   and `bufferOffset` was a transient **276** (not yet its final settled
   value). Effect #9 computed `idx = 376 − 276 = 100` — a coincidentally
   in-bounds but *wrong* index — and called `virtualizer.scrollToOffset(7320)`,
   a wrong-but-applied scroll.
2. **Effect #8 ("bufferOffset→0 guard") unconditionally wins afterward.**
   As the buffer continues correcting itself post-sort, `bufferOffset` passes
   through several more transient values before settling at 0 (observed
   sequence for one repro: `296→276→317→117→1→0`). The moment it transitions
   from any positive value to exactly 0, effect #8 force-resets
   `scrollTop = 0` (and calls `virtualizer.scrollToOffset(0)`) — with no
   awareness that a sort-around-focus scroll was already in flight for this
   *same* sort operation. Effect #9 never re-fires to correct this: its only
   trigger (`sortAroundFocusGeneration`) doesn't bump again for the same
   operation, so nothing ever re-applies the correct scroll once the data
   settles.

This fully explains both F3 and F4's identical symptom — `focusedImageId`/
index resolve correctly, `sortAroundFocusGeneration` bumps, but `scrollTop`
is left at 0 because effect #8's blunt "any transition to 0" guard doesn't
distinguish "buffer legitimately collapsed to viewport-start" (its intended
case) from "a sort-around-focus operation is mid-flight and must not be
clobbered" (this case).

**Evidence:** store state (`__kupua_store__.getState()`) before/after each
trial, including `sortAroundFocusGeneration` explicitly checked non-zero;
`scrollTop`/`scrollHeight`/`clientHeight` on the grid region; DOM query for
the focused cell; index positions cross-checked against the expected mirror
formula (`total - 1 - originalIdx`) for both trials, confirming the re-sort
itself worked correctly; plus one additional trial with temporary runtime
logging inside effects #8 and #9 (`useScrollEffects.ts`, reverted after use)
directly confirming the stale-index race and the effect-8 clobber, in that
order, with exact intermediate values recorded above.
**Repro spec:** not written this session.

## Tier scope — CONFIRMED (two-tier and seek tier both unaffected)

**Bed:** real TEST cluster (SSH tunnel), pinned corpora from `e2e/README.md`
"Stable test corpora": two-tier = `nonFree=true&query=city:Dublin&until=2026-03-04T00:00:00`
(13,643 docs live — drifted slightly from the 14,399 documented, expected per
prior sessions); seek = `nonFree=true&until=2026-03-04T00:00:00` (1,251,871
docs live). Same repro method as F4 (sort-direction toggle, explicit focus,
no query change), poll-until-settled + 1.5s margin before checking.

**Two-tier — 2/2 trials clean, matches documented guarantee exactly.**

| Trial | Pre-sort idx | Post-sort idx (predicted mirror) | `bufferOffset` | `scrollTop` | cell in DOM |
|---|---|---|---|---|---|
| 1 (desc→asc) | 6984 | 6658 (13643−1−6984=6658 ✓) | 6560 | 503855 (was 528701) | yes |
| 2 (asc→desc) | 2790 | 10852 (13643−1−2790=10852 ✓) | 10752 | 821829 | yes |

**Seek tier — 4/4 trials clean, matches documented guarantee exactly,
including the specific edge case effect #8 is designed to guard against.**

| Trial | Pre-sort idx | Post-sort idx (predicted mirror) | `bufferOffset` | `scrollTop` | cell in DOM |
|---|---|---|---|---|---|
| 1 (mid-list) | 641626 | 610244 (1251871−1−641626 ✓) | 610146 | 6969 (was 7272) | yes |
| 2 (deep→near-top) | 1244062 | 7808 (✓) | 7710 | 6969 | yes |
| 3 (deeper→idx 17, `bufferOffset` lands on exactly **0**) | 1251853 | 17 (✓) | **0** | 957 | yes |
| 4 (rapid, 100ms-resolution sampling from the moment of the click) | 448466 | 803404 (✓) | 803306 (already settled at first 100ms sample, generation already bumped, no transient race visible at all) | 7017 (constant across all 38 samples over 4s) | yes |

Trial 3 specifically targeted the exact condition effect #8's guard fires on
(`bufferOffset` transitioning to precisely 0) — the mechanism confirmed to
cause the buffer-tier bug — and it still resolved correctly. Trial 4 shows
the settle happening faster than a single 100ms sampling interval, with no
observable intermediate/wrong state.

**Why seek tier is likely immune despite sharing the subtraction code path
(code-level explanation, secondary to the live results above):**
`_findAndFocusImage` in `search-store.ts` has a deep-seek-specific path (no
position map, total > 65k) that uses an *estimated* offset (`hintOffset` from
`_focusedImageKnownOffset`, or 0) for the initial synchronous buffer load,
then fires `countBefore` in the background and silently corrects
`bufferOffset`/`imagePositions` once it resolves — a two-phase mechanism that
doesn't exist for buffer tier (whole result set loads in one page, offset is
always known exactly and synchronously). This is very likely *why* the
buffer-tier race can't get a foothold here, though the exact re-render timing
that makes it self-correcting wasn't traced instruction-by-instruction (unlike
F4's buffer-tier trace). **Note:** a code comment in `useScrollEffects.ts`
(above the `sortFocusRatioRef`/`phantomIdRef` definitions) claims the async
correction "changes `findImageIndex` → re-fires this effect" — this appears
to be stale/inaccurate against the current code: `findImageIndex` in
`useDataWindow.ts` has deliberately stable `[]` deps (per an explicit
audit-fix comment referencing F-05 C5/G-01) specifically to *prevent*
re-firing on buffer/offset changes. Worth a comment cleanup in a future
session, not chased further here since the live trials already give a
confident empirical answer independent of the exact mechanism.

**Conclusion:** the F3/F4 bug is **buffer-tier-specific** in observed
behaviour. Two-tier is structurally immune (no subtraction). Seek tier shares
the vulnerable subtraction formula but does not manifest the bug in practice,
most likely due to the deep-seek async-correction path described above.

**Buffer tier — reproduced 2/2 on real TEST too** (prior F3/F4 trials above
used a local mock corpus; this confirms the bug on the actual pinned
buffer-tier query, `keyword:"mid length half celebration"`, 868 docs live):

| Trial | Pre-sort idx | Post-sort idx (predicted mirror) | `bufferOffset` | `scrollTop` | cell in DOM |
|---|---|---|---|---|---|
| 1 (desc→asc) | 444 | 423 (868−1−444=423 ✓) | 0 | **0** | **no** |
| 2 (asc→desc) | 180 | 687 (868−1−180=687 ✓) | 0 | **0** | **no** |

Full 3-tier coverage is now confirmed live against real TEST, all using the
same pinned corpora and repro method: **buffer tier broken (6/6 trials
counting the earlier local ones), two-tier and seek tier both clean.**

## Continuation

- No Playwright repro spec was written for F3 or F4 this session (time was
  spent reproducing both via direct store/DOM inspection — F3 three times, F4
  twice — per the "reproducible twice, independent starting points" bar).
  Writing specs mirroring both trials, plus a fix, is a reasonable next step.
- **Tier scope: two-tier and seek tier both confirmed unaffected, live
  against real TEST — see "Tier scope" section below for full data.** The
  earlier code-reading inference (buffer and seek share the vulnerable
  subtraction path, two-tier is structurally immune) was half right: two-tier
  is indeed immune, confirmed by trial. Seek tier, despite sharing the
  subtraction code path, did **not** reproduce the bug in 4/4 live trials —
  including one where `bufferOffset` settled at exactly 0 (the specific
  trigger condition for effect #8's guard). The bug is therefore
  buffer-tier-specific in observed behaviour, not tier-agnostic as the F3/F4
  root-cause trace alone would suggest.
- **Root cause is confirmed for buffer tier** (see F4 section above) — both
  F3 and F4 stem from the same effect-8/effect-9 race in
  `useScrollEffects.ts`, traced with live values. Whether it *also*
  reproduces for keyboard-navigation-driven off-screen focus changes in
  buffer tier is still untested but plausible given the shared,
  trigger-agnostic nature of the two effects.
- **Fix not attempted this session** — this was investigation-only, per the
  audit/bug-hunt discipline of not mixing bug-finding with fix authorship.
  A fix would need to either (a) make effect #9 wait until buffer data has
  fully settled before computing its scroll target (e.g. re-fire when
  `bufferOffset`/`imagePositions` catch up, not just once per generation), or
  (b) make effect #8's guard aware of an in-flight sort-around-focus
  operation and skip its reset in that case. Both need careful thought about
  ordering guarantees and are not "one-line" fixes — recommend a dedicated
  fix session with a failing test written first.
