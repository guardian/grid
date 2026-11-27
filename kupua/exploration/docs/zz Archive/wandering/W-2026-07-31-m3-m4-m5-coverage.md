# M3 / M4 / M5 — first coverage, live TEST app

**Date:** 2026-07-31
**Bed:** TEST (live app at `kupua.media.local.dev-gutools.co.uk`, direct-ES)
**Missions:** M5 (history stress), M3 (resize under load), M4 (detail round-trip depth)
**Result: 0 findings, 1 low-severity observation (not filed as a bug).** All three
missions had never been run in any tier before this session. This is a genuine,
deliberate "clean" result, not an incomplete session — see § Coverage below for exactly
what was exercised. Follow-up sessions completed full 3-tier coverage for all three
missions (see "M4 continued", "M5 continued", and "M5 continued again" below). A
phantom-anchor restore quirk observed in both buffer and seek tiers is noted for
completeness — does not meet the bar for a finding (see those sections for why).

This session followed directly after three fix commits landed on `mk-next-next-next`
(`5cf570e1d`, `34c168e41`, `dbb332f5f` — scrubber stuck in seek-mode, sort-around-focus
scroll clobbered by buffer top-up, buffer-tier column shift). Part of the intent here
was to stress exactly the mechanisms those fixes touch (buffer top-up, sort-around-focus,
column alignment) from new angles (history, resize, detail-traversal) to check for
sibling bugs. None found.

## Coverage

### M5 — history stress, two-tier (`city:Dublin`, actual total 13,603)
Sequence: scroll → density round-trip (grid→table→grid) → search change (added
`is:agency-pick` via facet click) → detail open → back → back → forward → back →
sort toggle (new key) → scroll → Details panel open → back → forward → back.
Four independent back/forward restores of two different history keys, all exact
matches (kupuaKey, `focusedImageId`, anchor image ID, position via `imagePositions`).
One notable case: forward-navigating back into the sort-toggled key restored the
scroll+panel state as it was **at the moment of leaving** that key, not as it was
right after entering it — i.e. snapshot capture is on-exit, not on-entry. Correct,
and worth knowing as a fact about the mechanism rather than a surprise.
**Oracle: 7.2. No findings.**

### M3 — resize under load, three tiers
- **Seek tier** (`has:peopleInImage`, 280,683 docs): fired `store.seek(140000)`,
  called `page.setViewportSize()` before awaiting the seek's settle. Buffer settled
  to a sane offset (140,124), zero duplicate IDs, no console errors.
- **Buffer tier** (`keyword:"mid length half celebration"`, 856 docs): set explicit
  focus mid-list, fired a sort-direction toggle, resized twice (down then up) before
  and during settle. Focus persisted, index correctly mirrored (76 → 779, exact
  expected reflection for a direction flip), scroll landed on the focused cell,
  zero duplicates, console clean.
- **Two-tier** (`city:Dublin`, 13,600 docs): large `scrollTop` jump (triggers
  `extendForward`), resized down then back up mid-fetch. Buffer settled cleanly,
  zero duplicates, console clean.

**Caveat — not a pass, a documented limitation:** the single most interesting
sub-scenario for M3 (resize landing *during* an actual `extendBackward` network
round-trip in buffer tier, the exact mechanism the column-shift fix touched) could
not be reliably reproduced through this tool. Buffer-tier queries at ≤1000 total
load their entire result set in one page once settled; `extendBackward` only fires
transiently during `_topUpScrollModeBuffer` right after a sort change with explicit
focus, and that window closes (auto-fills) faster than this tool's per-call
round-trip latency allows a resize to land inside it. Every attempt (3 tried)
found the buffer already fully re-populated by the time the resize command
executed. **This is a tooling/timing limitation of the embedded-browser
instrument, not evidence the scenario is safe** — if this exact race matters, it
needs a Vitest-level test with a controllable/delayed mock adapter, not a live
browser session. Flagged as a gap, not closed.
**Oracle: 7.1, 7.3. No findings within what could be exercised.**

### M4 — detail round-trip depth, two tiers
- **Seek tier** (`has:peopleInImage`): opened detail at position 47, arrowed
  forward 25 times (→ position 72/73), returned via back. Landed exactly on the
  last-viewed image, cell rendered, scroll correct.
- **Buffer tier** (`keyword:"mid length half celebration"`, 856 docs): opened
  detail at position 54, arrowed backward 25 times (→ position 29), returned via
  back. Same result — landed exactly on the last-viewed image.

Both traversals used a single history entry for the whole detail session — one
"back" press exits detail entirely regardless of how many images were arrowed
through (traversal uses `replaceState`, not a push per arrow step). This directly
answers the cookbook's open question ("where should you land after a long detail
session") for these two cases: **you land on the last-viewed image, not the image
you entered detail on.** Not reported as a bug — matches the "Never Lost"
philosophy and wasn't observed as inconsistent or surprising in either tier.
**Oracle: 7.2. No findings.**

## M5 continued — buffer tier (`keyword:"mid length half celebration"`, follow-up session)

Ran the same M5 recipe as the two-tier pass above, in a fresh tab, buffer tier
(total 856). Density round-trip (grid→table→grid) held the anchor **exactly**
(same image ID, same position) — better than two-tier's earlier 0–1 position
drift. Search-change → detail-open → back→back→forward→back all correctly
restored `focusedImageId` and history keys exactly, every time, including
`focusedCellPresent: true` (the focused cell was confirmed rendered, not just
state-correct) on every restore.

**Observation, not a finding:** the *phantom* (unfocused) viewport anchor did
not restore to the identical image/position on every revisit of the same
history key, unlike the two-tier session where four separate revisits of the
same key gave bit-for-bit identical anchor + position every time. Here, the
same key's anchor moved 72 → 69 → 68 across three successive leave-and-return
cycles (interleaved with a density round-trip, a facet-narrow/detail/back
chain, and two sort toggles), landing on three different specific image IDs
along the way. However: it **stabilized** — the third and fourth restores of
the same key (separated by an intervening phantom-focus sort toggle, which
intentionally resets to top per the do-not-report list) gave the exact same
anchor image and position both times. So this is a bounded, self-stabilizing
rounding effect (consistent with `viewportRatio`-based reconstruction against
a buffer that may re-fetch with very slightly different ordering for
identically-timestamped test-data rows), not unbounded drift.

**Why this isn't filed as a finding:** (1) it doesn't compound — it reached a
fixed point after 2-3 cycles and repeated exactly after that; (2) the
invariant that actually matters per the doc table — **explicit focus** — was
exact and DOM-confirmed-present on every single restore, never affected; (3)
the magnitude (≤4 positions total, out of 856) is well inside the
already-established tolerance band from the 2026-07-30 scroll-batch session's
density-toggle drift ("<5 positions, within tolerance"); (4) the docs'
relaxation model (§4) already treats phantom-focus position tracking as
approximate by design, unlike explicit focus. **Flagging as a documented
observation for future sessions to watch, in case a future session finds a
case where it does NOT stabilize** — that would cross the bar into a real
self-consistency finding.

### M4 continued — two-tier (`city:Dublin`, 13,599 docs, follow-up session)

Opened detail at position 30, arrowed forward 25 times (→ position 55),
returned via back. Landed exactly on the last-viewed image —
`focusedImageId`, viewport anchor, and DOM presence all agreed on position 55,
console clean. Identical shape of result to the seek and buffer tier trials
above. **M4 now has clean coverage in all three tiers.**

## M5 continued again — seek tier (`has:peopleInImage`, follow-up session)

Ran the same M5 recipe in a fresh tab, seek tier (280,682 docs). Search-change
(facet-narrow to `is:agency-pick`, 345 docs) crossed from seek tier into
buffer tier mid-mission — a bonus tier-crossing exercise. Detail-open,
back→back→forward→back all restored `focusedImageId`, keys, and DOM presence
exactly on every visit, including across the tier crossing. Console clean
throughout.

**The same phantom-anchor settle-then-stabilize pattern seen in buffer tier
also showed up here — this revises that observation from "maybe buffer-tier
specific" to a cross-tier characteristic of the restore mechanism.** The base
key's anchor was bit-for-bit identical across its first two restores, then
shifted to a third, different image on the restore immediately following a
sort→scroll→panel-toggle round trip — then repeated that third image exactly
on a further forward+back cycle. Same shape as buffer tier: settles within a
few cycles, does not compound, doesn't touch explicit focus. Still not filed
as a finding for the same reasons as the buffer-tier observation above (seek
tier lacks a loaded position map by default, so exact drift magnitude in items
couldn't be quantified here — only anchor-image identity was compared — but
the settle-then-stabilize *shape* was unambiguous and matched buffer tier
exactly). **M5 now has clean coverage in all three tiers**, completing the
M3/M4/M5 trio at full 3-tier coverage.

## Off-scope appendix (capped, per cookbook)

- One isolated `404 Failed to load resource` fired during the M5 session
  (immediately after a facet click), not caught by the console.error patch
  (browser-level resource log, not a JS console call) and did not recur across
  3-4 similar subsequent transitions. Likely a one-off missing thumbnail.
  Not chased further.
- `net::ERR_ABORTED` `requestFailed` events fired for imgproxy full-res image
  requests during rapid detail arrow-key traversal (M4) — expected: each arrow
  press cancels the previous image's in-flight full-res fetch. Not a bug.
- Two-tier and seek-tier pinned-corpus totals in `AGENTS.md`/the cookbook have
  drifted from their documented values (`city:Dublin` 14,399 → 13,603 → 13,600
  across this single session; `keyword:zselect` was 794 in the 2026-07-30 M9
  session, now 7,065). TEST is evidently not fully static even with `until`
  pinning — see the playbook for the methodology note this produced.
