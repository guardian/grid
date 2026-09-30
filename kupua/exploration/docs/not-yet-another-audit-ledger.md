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
| L7 | Characterise | Nobody can state today's anchor choice for every transition x focus mode x selection x tier | Test matrix exercising the six decision sites (02 §2) through real code paths; records current results, including known L6 deviations as expected-to-change | |
| L8 | Consolidate | Effect 7's ratio capture (`useScrollEffects`) can move to the decision point in `useUrlSearchSync`, using the same anchor the search uses. Removes the layout-before-passive ordering dependency and ratios saved for an image other than the one searched for | Remove effect 7 in a temporary local change; run sort-around-focus, phantom-promotion and history e2e | L7 |
| L9 | Refactor | One table-driven anchor choice (D6) replaces the six precedence sites; per-transition, per-mode differences become explicit table entries | L7 matrix unchanged before and after, except entries changed by decided items. e2e `ui-features` "keeps the selected anchor through panel and window resizing" encodes pre-D5 behaviour and will need updating | L6, L7 |
| L10 | Refactor | The four placement captures (search ratio, density, column change, history snapshot) become one type and one capture/restore pair, with table header offset handled once | Density, sort, history e2e; perceived-perf suggestion | L9 |
| L11 | Consolidate | Detail-entry identity has three writers (push state in grid/table, `ImageDetail` synthesis effect, `useReturnFromDetail` opening transition) and three readers (`useReturnFromDetail`, `ImageDetail.entryImageIdRef`, `FullscreenPreview.entryImageIdRef`); `ImageDetail`'s ref is wrong after reload-then-traverse | Reload in detail, traverse, swipe-dismiss vs Back: compare pre-scroll and final centring | |
| L12 | Delete | After L8-L11, some reset-to-home suppressions (`suppressNextRestore`, `suppressReturnFromDetail`, `suppressDensityFocusSave`, dedup preset) may no longer be needed | Disable each alone in a throwaway change; run reset-to-home unit and e2e from grid, table and detail | L8, L11 |
| L13 | Bug | If reset-to-home is cancelled or its search fails while deep in seek tier, the scrubber's thumb-reset generation is never consumed and the discrete thumb sync stays blocked until the position returns near the top | Unit or browser: start Home on a deep buffer, cancel via Back, observe thumb | |
| L14 | Move | `search-store.ts` (~4.4k lines) mixes position logic with aggregations, sort distributions and the new-images poll; moving those out lets a session read the position core alone | Pure move; all tests unchanged | |
| L15 | Decision | D5 settles selections. Open: in explicit mode, should an off-screen explicit focus pull the view back on a layout transition (current density behaviour: it is placed at its saved ratio, then clamped into view), or keep the visible centre? | Operator | |
| L16 | Doc | `03-scroll-architecture.md` and `04-browser-history-architecture.md` are unverified against current code; `05-selections.md` anchor-precedence text probably contradicts D5 | Rewrite timelessly when a session touches them | |
| L17 | Bug | Violates D5: repeatedly switching density moves the view progressively further from the initial centre image (operator-observed, both modes). Suspects: the viewport centre is re-elected on every save, so identity is not stable across cycles; header offset or edge clamps not round-tripping; a hidden focus (L6) as anchor | Browser or e2e: note the centre image, toggle density N times, compare its viewport position after each cycle; find existing density round-trip tests and why they pass | L7 subset |
