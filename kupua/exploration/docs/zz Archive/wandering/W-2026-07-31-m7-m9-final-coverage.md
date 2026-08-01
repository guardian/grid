# M7 and M9 — remaining tier coverage, live TEST post-fix verification

**Date:** 2026-07-31
**Bed:** TEST (live app)
**Missions:** M7 (seek idempotence — buffer, two-tier), M9 (focus as bookmark
— explicit-focus+sort-toggle re-verified in all 3 tiers post-fix, plus a
tier-crossing density observation)
**Result: 0 findings.** This closes out the last two missions with meaningful
tier gaps in the 11-mission set.

## M9 — explicit focus + sort toggle, post-fix live-TEST verification, all 3 tiers

This is the exact mechanism `34c168e41` and `dbb332f5f` fixed (F3/F4: focus
survives a sort change but the scroll-to-focus effect didn't fire, then a
buffer-tier column shift on top of that). Earlier post-fix verification in the
F-2026-07-31 finding doc's Resolution section didn't specify whether its 3
live repros were run against TEST or local — this session ran a clean,
explicit, live-TEST-only re-check in all three tiers, none of which had been
exercised this way *this session* (earlier sort toggles this session were all
phantom-focus, not explicit-focus).

- **Seek tier** (`has:peopleInImage`, 280,680 docs): focus set mid-list, sort
  toggled. `bufferOffset` correctly jumped to 280,520 (near-total, the mirror
  position for a near-top item after an ascending flip), `focusedCellPresent:
  true`, stable across 4 polled samples (400ms apart, using `loading === false
  && sortAroundFocusStatus === null` as the settle condition per the earlier
  F3 lesson — no fixed-wait guessing).
- **Two-tier** (`city:Dublin`, 13,595 docs): same test. `bufferOffset` jumped
  to 13,432, `scrollTop` to 1,024,794 (two-tier's virtualized total height),
  `focusedCellPresent: true`, stable across 4 samples.
- **Buffer tier** (`keyword:"mid length half celebration"`, 856 docs): same
  test, but this one is the most telling — `bufferOffset` was caught
  *mid-settle* across the 4 samples (496 → 96 → 0 → 0, with `scrollTop`
  co-varying 22470 → 52770 → 60042 → 60042) as the async
  `_topUpScrollModeBuffer`/`extendBackward` chain progressively filled the
  buffer backward. **`focusedCellPresent` was `true` at every single sample,
  including the intermediate ones** — this is exactly the scenario the fix
  addressed (previously the cell could be lost or the scroll clobbered mid-
  settle) and it held up cleanly under live observation, not just at the
  final settled state.

**Conclusion: the fix is confirmed working live on TEST in all three tiers,
including catching the buffer-tier async settle process in the act.**

## M9 — tier-crossing density observation (not a bug, documented for future sessions)

Attempted the mission's other named scenario (search-context-change narrowing
across a tier boundary) using `has:peopleInImage` (280,680, seek) →
`is:agency-pick` (345, buffer) with explicit focus set near the top of the
list. Result: `focusedImageId` became `null` (reset to top), reproduced
consistently across 5 polled samples — not a timing artifact.

**This is very likely correct, not a bug**, per §2.3 of the architecture doc:
the fallback only checks a *limited window* of cached neighbour IDs (±10-20)
around the focused item, not the full new result set. `is:agency-pick` is a
sparse tag (345/280,680 ≈ 0.12%) — it is entirely plausible that none of the
~20 nearest neighbours of a given focused item happen to carry it, causing the
documented "no neighbours survive → reset to top" branch to trigger correctly
even though the two sets aren't literally disjoint. This is different from
F3's original bug (a neighbour *was* found but the scroll didn't happen) —
here, no neighbour was found at all, which is a different, intentional code
path. **Not filed as a finding.** Flagged here so a future session doesn't
waste time re-litigating it: if you want to test the "neighbour found, does it
scroll" path specifically, pick a denser narrowing (higher-frequency tag) or
verify neighbour absence first, don't assume any subset-narrowing will trigger
the interesting branch.

## M7 — seek idempotence (route comparison), buffer and two-tier

Previously only tested in seek tier, where a real medium-confidence effect
was found (F2: click vs. drag-from-above vs. drag-from-below landing on
measurably different positions, `wandering-findings/W-2026-07-30-seek-idempotence.md`).
This session tests the same 3-route comparison (identical target pixel on the
scrubber track, fresh tab per route per the established anti-confound
methodology) in the two tiers that use `scrollContentTo()` instead of a
cursor-based `seek()` formula.

- **Buffer tier** (`keyword:"mid length half celebration"`): click,
  drag-from-above, and drag-from-below to the identical track pixel all gave
  **bit-for-bit identical** results (`anchor`, `bufferOffset: 0`,
  `scrollTop: 32775`, 0 duplicates).
- **Two-tier** (`city:Dublin`): same 3 routes, same identical-target-pixel
  methodology (waited for `_seekGeneration` to bump, not just `loading`, per
  the established two-tier lesson). All 3 routes gave **bit-for-bit
  identical** results (`anchor`, `bufferOffset: 6852`, `scrollTop: 526883`, 0
  duplicates).

**This confirms F2's own mechanism theory**: the route-dependence effect is
specific to the seek tier's cursor-position-based seek formula
(`thumbVisibleCount`/`positionFromY` math), not present in buffer/two-tier's
direct `scrollTop` assignment, which has no equivalent formula to be biased.
**M7 now has coverage in all three tiers — clean in two of them, with the
pre-existing medium-confidence F2 open question still standing only in seek
tier.**

## Off-scope appendix

None this session.
