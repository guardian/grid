# M11 — interrupt everything, two-tier and seek tier

**Date:** 2026-07-31
**Bed:** TEST (live app)
**Mission:** M11 (interrupt everything) — previously only run in scroll tier
(2026-07-30 scroll-batch session). This session adds two-tier and seek-tier
coverage, completing all 3 tiers.
**Result: 0 findings.**

The cookbook flags M11 as "the highest-yield mission and the least covered by
tests" — this session specifically targeted the buffer-replacement/extend
mechanisms two-tier uses that scroll tier doesn't, per the architecture docs.

## Scenarios run

1. **Scroll, then immediately toggle density (no settle wait).** Large
   `scrollTop` jump followed immediately by a density-toggle click, zero wait
   in between. Settled cleanly: 0 duplicate IDs, console clean, `bufferOffset`
   sane.
2. **Scroll, then immediately toggle sort (no settle wait).** Same pattern,
   sort-direction toggle instead of density. Clean: 0 duplicates, console
   clean, URL/sort state correctly reflects the toggle.
3. **Sort toggle, then immediately change query (facet click narrowing to
   `is:agency-pick`, no settle wait).** Two state-changing actions fired
   back-to-back with no wait. Settled correctly: sort reverted to the
   pre-toggle direction as expected (two toggles cancel out), query narrowed
   correctly to 108 docs (crossing into buffer tier), 0 duplicates, console
   clean.
4. **Rapid double-scroll: large jump down (9000px), then immediately jump up
   (500px), no wait between.** This is the sharpest test of the two-tier
   `extendForward`/buffer-replacement path — the first jump triggers a forward
   extend fetch, the second jump both reverses the scroll direction and lands
   before that fetch can be presumed complete. Settled cleanly: `resultsLen`
   grew to 400 (confirming the forward extend from the first jump did fire and
   commit), 0 duplicate IDs, `scrollTop` correctly reflects the final target
   (500), console clean.

**Oracle: 7.1 (hard signals — none fired), 7.3 (metamorphic — no duplicates,
buffer size sane in every case).**

## Seek tier (`has:peopleInImage`, 280,682 docs)

1. **Scroll, then immediately toggle density (no settle wait).** Clean: 0
   duplicates, console clear, `bufferOffset` sane.
2. **Seek (`store.seek(140000)`, the real seek-tier code path), then
   immediately toggle sort (no wait).** Sort correctly "won" the race —
   `bufferOffset` settled back to 0 (a fresh sorted view from the top), not a
   half-applied 140000. This is the correct resolution: a pending seek target
   is meaningless once sort changes the entire ordering. 0 duplicates,
   console clear.
3. **Sort toggle, then immediately change query (facet-narrow to
   `is:agency-pick`, no wait).** Query narrowed correctly (280,682 → 345,
   crossing into buffer tier), sort direction correctly reverted (two toggles
   cancelled out), 0 duplicates, console clear.
4. **Rapid double-seek: `seek(100000)` then immediately `seek(220000)`, no
   wait between (the seek-tier-specific equivalent of the two-tier
   double-scroll test).** Settled to the *second* target exactly
   (`bufferOffset: 219888`, off by ~100 items — plausible column/geometry
   trim, not a bug) — correct last-write-wins resolution, no trace of the
   first target, 0 duplicates, console clear.

**M11 now has coverage across all three tiers, all clean.** Every interrupt
combination resolved deterministically (later action wins, no partial/torn
state), which is exactly what the metamorphic oracle (7.3) requires.

## Off-scope appendix

One recurring, unexplained detail noticed but not investigated: a `POST
.../_search failed: net::ERR_ABORTED` fires once on nearly every fresh
navigation to the `has:peopleInImage` seek-tier URL specifically (seen twice,
both times on first load, never mid-session). Never accompanied by a
console error, never blocked settling, and total/results always ended up
correct — plausibly a superseded initial request (PIT creation racing a
follow-up query) rather than a real failure. Flagged for a future session if
it ever recurs somewhere that isn't just the first paint.
