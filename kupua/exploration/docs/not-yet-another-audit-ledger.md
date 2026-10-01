# Core Logic Cleanup Ledger

Open work on Kupua's position engine: dead wood, misleading comments, operator
decisions, consolidation. Worked one item per session with the
[session prompt](not-yet-another-audit-prompt.md). Behaviour and ownership are
described in [focus and position preservation](00%20Architecture%20and%20philosophy/02-focus-and-position-preservation.md).

Rules: open items only, at most 20. A resolved or refuted item is deleted (code
changes go to the changelog, never here). A new item needs a claim, a check that
could disprove it, and a kind. Claims are hypotheses until the check has run.

## Decisions

- **D1 Preserve strictly, relax deliberately.** Every transition keeps the anchor
  image at the same viewport position; relaxations are explicit, per transition,
  with a named target (top, visible centre image, specific image). See 02 §1, §4.
- **D2 Phantom mode anchors on what is visible.** In phantom mode a hidden
  `focusedImageId` is never an anchor; the selection anchor or viewport centre is.
- **D3 Behaviour is fixed during consolidation.** Refactor items change no
  observable behaviour; any behaviour change is its own decided item.
- **D4 No speed-up claims without measurement.** The goal for this core is no
  regression, checked with the perceived-performance suite.
- **D5 Layout transitions keep the visible centre.** Browser resize, panel toggle
  and density switch keep the visible centre image in place, in both modes. An
  off-screen selection anchor never pulls the view back. (Column change currently
  anchors on an off-screen selection by preserving its off-screen ratio; the
  visible result is acceptable, and aligning it is part of L9.)
- **D6 Policy is data.** Answers depend on transition, mode and anchor type (and
  whether the anchor is on screen), and will be revised. The anchor choice should
  be one table-driven decision, so changing one answer is a local edit (L9).
- **D7 Tiers are invisible.** Buffer, two-tier and seek tiers are implementation
  detail. Every preservation behaviour must be identical across tiers; a
  tier-dependent outcome is a bug. Characterisation (L7) covers every tier.
- **D8 Under reconsideration: position and focus.** No blanket anchor policy
  for layout changes or history is approved by this entry. A history entry's
  own focus (including no focus) and its viewport position are separate concerns:
  restoring position must not discard that focus or substitute another entry's.
  L7 must expose the cases before the operator settles their scrolling policy.
  Whether density changes should create history entries is also undecided;
  keeping density in the URL does not require pushing a new entry.

## Next Step: Characterise Before Fixing

L7 comes before further anchor-policy fixes or consolidation. Use the committed
implementation as the baseline; descriptions below are claims, not proof or
implementation approval. Compare D5/D8, guides and test assertions explicitly;
do not silently resolve overlapping or conflicting rules.

Produce one compact decision table in the existing 02 guide, not another report.
Cover density switches, browser/panel resize, query/filter/sort changes, seek and
keyboard navigation, detail/fullscreen return, Back/Forward and reload. Group
equivalent cases, distinguishing mode, selection versus focus, visibility and
loaded versus unloaded anchors. Record viewport anchor/placement, focus,
selection, and history/URL effects separately.

Each row needs current behaviour with source/test evidence, written contracts
and any conflicts, the operator's decision (or undecided), and verification gaps.
Tiers are verification columns, not separate product policies. Read existing
tests/results first and probe only unresolved questions; distinguish source
inference from observed results. Characterisation assertions describe current
behaviour, not automatically desired behaviour. No product fixes during L7.

## Leave Alone

Generation counters, abort controllers and owned suppression releases; prepend
and evict compensation; column alignment; the tier decision from `total`; seek
estimation paths; kupuaKey; the two-frame density restore. Revisit only with new
evidence.

## Open Items

Kinds: **Delete**, **Comment**, **Bug**, **Decision**, **Characterise**,
**Consolidate**, **Refactor**, **Move**, **Doc**.

| # | Kind | Claim | Disproof check | Depends |
|---|---|---|---|---|
| L6 | Bug | Violates D2: phantom-mode detail open (`ImageGrid.enterDetail`, `ImageTable.handleRowDoubleClick`), detail close (`useReturnFromDetail`) and middle-click set `focusedImageId`; later filter change, density switch and column change anchor on it instead of the viewport centre | Browser, phantom mode: open detail, close, scroll far, change filter / density / panel. Expected by D2: stays near visible centre. Write the failing test first | L7 subset |
| L7 | Characterise | Current behaviour, written contracts and intended policy are not clearly separated | Deliver the decision table specified above, with contradictions and unknowns explicit; targeted checks through real paths, no fixes | |
| L8 | Consolidate | Effect 7's ratio capture (`useScrollEffects`) can move to the decision point in `useUrlSearchSync`, using the same anchor the search uses. Removes the layout-before-passive ordering dependency and ratios saved for an image other than the one searched for | Remove effect 7 in a temporary local change; run sort-around-focus, phantom-promotion and history e2e | L7 |
| L9 | Refactor | A shared anchor decision may replace duplicated policy while retaining necessary per-transition differences | Compare the L7 matrix before/after; reconcile `ui-features` "keeps the selected anchor through panel and window resizing" with D5 before deciding whether its assertions should change | L6, L7 |
| L10 | Refactor | The four placement captures (search ratio, density, column change, history snapshot) become one type and one capture/restore pair, with table header offset handled once | Density, sort, history e2e; perceived-perf suggestion | L9 |
| L11 | Consolidate | Detail-entry identity has three writers (push state in grid/table, `ImageDetail` synthesis effect, `useReturnFromDetail` opening transition) and three readers (`useReturnFromDetail`, `ImageDetail.entryImageIdRef`, `FullscreenPreview.entryImageIdRef`); `ImageDetail`'s ref is wrong after reload-then-traverse | Reload in detail, traverse, swipe-dismiss vs Back: compare pre-scroll and final centring | |
| L12 | Delete | After L8-L11, some reset-to-home suppressions (`suppressNextRestore`, `suppressReturnFromDetail`, `suppressDensityFocusSave`, dedup preset) may no longer be needed | Disable each alone in a throwaway change; run reset-to-home unit and e2e from grid, table and detail | L8, L11 |
| L13 | Bug | If reset-to-home is cancelled or its search fails while deep in seek tier, the scrubber's thumb-reset generation is never consumed and the discrete thumb sync stays blocked until the position returns near the top | Unit or browser: start Home on a deep buffer, cancel via Back, observe thumb | |
| L14 | Move | `search-store.ts` (~4.4k lines) mixes position logic with aggregations, sort distributions and the new-images poll; moving those out lets a session read the position core alone | Pure move; all tests unchanged | |
| L15 | Decision | Density switches prefer an in-buffer explicit focus even off-screen; desired anchor precedence awaits characterisation, not a blanket D8 rule | Compare visible, off-screen loaded and unloaded focus/selection across modes; separately record viewport placement and retained focus for operator decision | L7 |
| L16 | Doc | `03-scroll-architecture.md` and `04-browser-history-architecture.md` are unverified against current code; `05-selections.md` anchor-precedence text probably contradicts D5 | Rewrite timelessly when a session touches them | |
| L18 | Bug | Violates D5, bounded: a density switch places the anchor's row *top* at the saved ratio, so between 303px grid rows and 32px table rows the visible centre shifts by up to about two grid rows (observed 0-10 items), converging after 1-3 switches. Placing the anchor's row centre at the same fraction of the usable viewport (below the table header) should hold it. Changes placement for focused images too, so the KUP-017 unit expectations in `useScrollEffects.test.ts` will change | Browser: cycle density without focus at several window sizes; record the viewport anchor's global index each switch | L15 |
| L19 | Decision | Why the buffer tier (total up to `SCROLL_MODE_THRESHOLD`) exists separately from two-tier; it adds the background fill and top-up machinery | Separate audit; check what would break if two-tier covered small results | |
| L20 | Decision | History snapshots conflate the placement anchor with focus restoration; independent per-entry focus and viewport policy require characterisation | Trace push, departure capture, Back/Forward, reload and display-only entries. Compare entries with distinct focus or none; never accept losing focus as the price of restoring position. Density push versus replace remains undecided | L7 |
