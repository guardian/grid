# M1, M2, M6, M8 — two-tier and seek-tier re-runs

**Date:** 2026-07-31
**Bed:** TEST (live app)
**Missions:** M1 (density round-trip), M2 (panel thrash), M6 (reload at awkward
moments), M8 (monotonic scroll) — all four previously verified only in scroll
tier (2026-07-30 scroll-batch session). This session adds two-tier and
seek-tier coverage for all four in one batch.
**Result: 0 findings across all 8 mission×tier combinations.**

## Two-tier (`city:Dublin`, 13,598 docs)

- **M8 (monotonic scroll):** 8 steps of steadily increasing `scrollTop`.
  Anchor position strictly increased every step (18, 33, 48, 63, 78, 93, 108,
  123), 0 duplicate IDs at every step, console clean.
- **M1 (density round-trip):** grid (pos 123) → table (pos 124, 1-item drift,
  within established tolerance) → grid (pos 123, exact match to start). 0
  duplicates, console clean.
- **M2 (panel thrash):** 5-step toggle sequence (browse-off, details-on,
  browse-on-both-open, details-off, both-closed) at a fixed scroll depth.
  Anchor oscillated between 3 nearby images (122-124) tracking viewport-width
  changes from panel open/close — same image reappeared exactly whenever the
  panel combination repeated (browse-off alone gave the same anchor both times
  it occurred: at start and at the end). No drift accumulation, console clean
  throughout.
- **M6 (reload at awkward moments):** 3 scenarios, all clean: (1) reload
  immediately after a large scroll jump, no settle wait — buffer resettled
  correctly (`resultsLen` 400, 0 duplicates); (2) reload immediately after a
  sort toggle, no settle wait — sort direction correctly survived the reload
  (`orderBy=uploadTime` in the restored URL); (3) reload while detail was
  open — URL and `focusedImageId` both correctly preserved across the reload.

## Seek tier (`has:peopleInImage`, 280,682/280,680 docs)

- **M8 (monotonic scroll):** Same 8-step scroll. `bufferOffset` stayed at 0
  throughout (expected — forward scroll in seek tier grows `resultsLen`
  rather than moving `bufferOffset`, since there's no position map to anchor
  against), `resultsLen` grew 200→400 partway through (confirming a real
  `extendForward` fired), 0 duplicates at every step, anchor confirmed to be a
  real, valid image ID at the end with `scrollTop` matching the final target.
- **M1 (density round-trip):** grid → table → grid gave an **exact** anchor
  match (no drift at all this time, unlike two-tier's 1-item drift). 0
  duplicates, console clean.
- **M2 (panel thrash):** Same 4-step toggle sequence. Anchor changed with
  every distinct panel-width combination (as expected), and the sequence
  showed one panel-width configuration (`details-on-both-open`) landing on
  the same anchor image as a later, different configuration
  (`both-closed`) — plausibly the two configurations don't cross a
  column-count breakpoint at this particular viewport size, not investigated
  further since no duplicates/errors occurred and this doesn't contradict any
  documented invariant (panel toggle only guarantees "anchor stays in view",
  not "different widths give different anchors"). Console clean.
- **M6 (reload at awkward moments):** 3 scenarios: (1) reload after a scroll
  jump — clean, matches the two-tier result; (2) reload immediately after
  firing a real `store.seek(150000)` (the seek-tier-specific version of this
  scenario, not tried in two-tier since two-tier doesn't use `seek()` for
  in-viewport scrolling) — the in-flight seek was correctly abandoned by the
  navigation with no corruption (`bufferOffset: 0`, `resultsLen: 400`,
  matching the pre-seek settled state, 0 duplicates); (3) reload while detail
  open — URL and `focusedImageId` correctly preserved, identical to two-tier.

**Oracle: 7.2 (self-consistency — round-trips return to start), 7.3
(metamorphic — monotonic anchor, no duplicates, buffer size sane), 7.1 (hard
signals — none fired in any of the 8 combinations).**

## Off-scope appendix

None this session.
