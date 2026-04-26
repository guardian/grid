# Handoff — Browser history baseline tightening

This is a self-contained brief for the agent doing the baseline-tightening
implementation work. **Read this whole file, then read
[browser-history-analysis.md](./browser-history-analysis.md) in full.**
That doc is the source of truth for current behaviour, the guiding philosophy,
the completed audit table, and the decisions already made; this handoff only
frames the task and the gotchas.

**Status as of 25 April 2026:** the audit phase is complete. All five
baseline items are scoped, all five audit-table follow-up questions are
answered. Your job is implementation, not discovery.

## Goal

Tighten kupua's browser history model so it conforms to the guiding philosophy in [browser-history-analysis.md](./browser-history-analysis.md) ("History should let the user traverse all *useful* views"), is internally consistent across all push/replace decisions, and is well-covered by e2e tests. **Do this before any snapshot / position-preservation work** — that work depends on a clean substrate.

Do **not** start any of the "Future polish" items (scroll-position restoration, traversal entry-point bookmarking, sessionStorage persistence). That comes after, in a separate session.

## What to read first (in order)

1. **This file.**
2. [browser-history-analysis.md](./browser-history-analysis.md) — the whole doc. Pay particular attention to:
   - "Guiding philosophy" — the test you apply to every decision.
   - "History entry rules" table — current state of every push/replace site.
   - "Other custom behaviours worth knowing" — `suppressNextRestore`, sessionStorage offset cache, dev globals, display-only keys.
   - "Baseline tightening — prerequisites for any position-preservation work" — the five items that constitute this task. **All decisions inside it are final.**
   - "Audit table — every history-touching call site" — every site you'll be touching, with current and intended behaviour.
   - "Questions for the user" subsection — each is now decided (look for "DECIDED 25 April 2026" callouts). Treat the decisions as binding.
   - "Key files" — where everything lives.
3. The five files listed under "Key files" in the analysis doc. Read them in full, not snippets.
4. [e2e/local/browser-history.spec.ts](../../e2e/local/browser-history.spec.ts) — the existing 5 history tests.

## The task, restated

Implement the five items in "Baseline tightening — prerequisites for any position-preservation work" from the analysis doc. The decisions taken on top of those items (per the audit's "Questions for the user" subsection):

- **Q1 (close → history.back()):** YES, with deep-link synthesis on mount gated on `history.length === 1`, and `markUserInitiatedNavigation()` immediately before `history.back()`.
- **Q2 (preemptive `markUserInitiatedNavigation()` on raw sites):** YES, via a new `pushNavigate()` helper that wraps `markUserInitiatedNavigation(); navigate(...);`. All raw push sites funnel through it. No behavioural change today; removes a footgun.
- **Q3 (logo-reset opt-out):** Use a paired `pushNavigateAsPopstate()` helper alongside `pushNavigate()`. Logo-reset uses it; behaviour identical to today, but the popstate-by-default semantics become explicit instead of accidental.
- **Q4 (metadata click-to-search):** Keep as single push. No change required — just verify the existing behaviour with an e2e test.
- **Q5 (density toggle):** Keep as push. Lock with the e2e proposed in baseline item 3.
- **FullscreenPreview (added 25 April 2026, baseline item 6):** Two scenarios reviewed; no behavioural code change beyond what falls out of Q1.
  - From list/grid: divorced from history is correct as-is. No change.
  - From ImageDetail: today's Backspace closes detail and lands on grid/table at P. After Q1, ImageDetail's Backspace handler — which already calls `closeDetail()` — automatically becomes history-aware (the detail at P remains forward-reachable). Esc and double-click stay divorced. Forward re-opens detail at P **non-fullscreen** (fullscreen is a UI mode of detail, not a separate URL state).
  - Concrete tasks: (a) update the doc comment at the top of `kupua/src/components/FullscreenPreview.tsx` to reflect the new history-aware Backspace semantics; (b) add an e2e: enter detail → `f` → Backspace → forward → re-opens detail at P in non-fullscreen.

In summary the implementation is:

1. **Close-button forward asymmetry.** Make `closeDetail` call `history.back()` instead of `navigate({ replace: true })`. Adds: deep-link synthesis on mount (gated on `history.length === 1`); `markUserInitiatedNavigation()` before `history.back()` so the resulting popstate doesn't reset offset to 0. All four close affordances (back button, double-click, Backspace, swipe-to-dismiss) share the `closeDetail` callback so it's one call site.
2. **Introduce `pushNavigate()` and `pushNavigateAsPopstate()` helpers.** Replace every raw `navigate()` site with one of the two helpers. `pushNavigate()` is the default (calls `markUserInitiatedNavigation()` then navigates); `pushNavigateAsPopstate()` skips the marking. Logo-reset uses the popstate variant; everyone else uses the default.
3. **Density toggle is a push** — no code change. Add an e2e (back-across-density preserves scroll position and re-toggles density) and a comment at the call site explaining the push choice.
4. **Logo-reset uses `pushNavigateAsPopstate()`** — makes the opt-out explicit instead of accidental. Comment at the call site explaining why this site is the exception.
5. **E2E coverage gaps.** Add tests for: forward-after-close (exercise the close-button affordances, not just browser-back); deep-link-synthesis on cold-load (both `history.length === 1` and `> 1` gate paths); density-in-history; logo-reset-back **from each of the two logo sites** (SearchBar logo and ImageDetail header logo — separate code paths, both currently untested, both being changed); metadata-click-to-search-as-single-push; fullscreen-from-detail-Backspace-then-forward.

The audit table's "Existing E2E?" column flags which sites have **no** current test defence — those are exactly where the new e2es above do the highest-value work, and where you must be most careful that production behaviour pre- and post-change matches your expectations (because no existing test will scream if it doesn't).

## Non-negotiable constraints

- **No visible flicker — rendered or URL bar.** Chrome and Firefox coalesce same-tick `replaceState` + `pushState`; that's how the deep-link synthesis works without flicker. Verify this assumption holds on current Chrome and Firefox during prototyping.
- **Closing or browser-back from detail must always land on the current detail image P** (the one being viewed at the moment of the close/back), not the entry image. This rules out variants that defer push decisions to close time. See the relevant constraint paragraph in the "traversal entry point" hypothetical for context — it's a hard line.
- **Don't break the popstate-vs-user-initiated distinction.** The user-initiated flag is what makes back/forward differ from user clicks today. If you funnel raw `navigate()` calls through a helper, make sure logo-reset still consumes `false` from `consumeUserInitiatedFlag()` (it depends on this for reset-to-top semantics).
- **Don't touch anything in `Future polish` of the analysis doc.** No snapshot map, no `sessionStorage` persistence, no traversal entry-point bookmarks. If you find yourself thinking "I should also…" about position/focus restoration, stop and write it down for the next session.

## Why this sequencing matters

Quoting the analysis doc's closing paragraph of the baseline section:

> The snapshot scheme adds a per-entry payload that is read on popstate and written on push. If the push/replace decisions or the popstate-vs-user distinctions are inconsistent across call sites, the snapshot payloads will be inconsistent too — and snapshot bugs are far harder to diagnose than today's "back goes to offset 0" simplicity. Tighten the substrate first.

## Audit is already done

The "Audit table — every history-touching call site" subsection of the
analysis doc enumerates every site you'll be touching. **Don't re-audit.**
Use the table as your checklist:

- For each row, the table tells you the current behaviour and (via the
  baseline-item references) the intended behaviour.
- The table is also the place to update once you've made changes — the
  "Today's back/forward behaviour" column should reflect post-change
  reality by the end of the session.
- If you find a site that's not in the table, that's a discovery you
  should pause and ask about before changing anything. The audit was
  thorough; gaps are unlikely but possible.

## Test discipline

Per the directive in `.github/copilot-instructions.md`:
- Run unit tests from repo root: `npm --prefix kupua test 2>&1 | tee /tmp/kupua-test-output.txt`
- Run Playwright e2e: `npm --prefix kupua exec -- playwright test 2>&1 | tee /tmp/kupua-test-output.txt` (stop dev server on :3000 first)
- After any kupua/src change → unit. After any history change → also e2e (this work is all history changes, so always both).
- Foreground only. No `tail`/`head`/`sleep`. Don't re-run a running test — `read_file /tmp/kupua-test-output.txt`.

Perf surfaces (jank, perceived) are unlikely to be relevant to this work but flag the user if you change anything that touches `useScrollEffects.ts`, virtualizer paths, or `lib/orchestration/`.

### Regression watchlist — existing tests this work could break

The new e2es are listed in deliverable 5; this section is the inverse —
existing tests you should expect to be sensitive to the changes and
whose failures you must not paper over by editing the test. If one of
these breaks, the production behaviour likely regressed.

**E2E specs likely to react** (under `kupua/e2e/local/`):

- **`browser-history.spec.ts`** — the 5 existing tests. Items 1–3 directly
  change push/replace and user-initiated semantics; expect signal here.
  Particularly:
  - *Back from image detail preserves focused image* — exercises the
    Case A path. Item 1 (`closeDetail` → `history.back()`) shouldn't
    affect it (the test uses browser-back, not the close button), but
    confirm the test still does what its name claims.
  - *Focus is NOT carried into old search context on back* — exercises
    logo-style popstate semantics. Item 3 (`pushNavigateAsPopstate`)
    must preserve this; if logo-reset back starts carrying focus,
    item 3 was implemented wrong.
- **`focus-preservation.spec.ts`** — "Never Lost" + focus carry across
  sort/filter changes. Item 2's `pushNavigate()` helper preserves the
  flag, so behaviour should be identical; if any of these go red, the
  helper isn't marking when it should.
- **`phantom-focus.spec.ts`** — phantom-focus interacts with `enterDetail`
  push (item 2 touches both `ImageGrid.enterDetail` and
  `ImageTable.enterDetail`). Watch for any regression in how phantom
  resolves to a real focus on detail open / close.
- **`buffer-corruption.spec.ts`** — exercises the data window and
  restore paths. Item 1's mount-time `replaceState` + `pushState`
  synthesis runs early; if it races with the buffer setup, this is
  where it'll show.
- **`keyboard-nav.spec.ts`** — covers Backspace/arrow handling that
  intersects items 1 and 6 (FullscreenPreview from detail). Particularly
  any test that exercises Backspace inside ImageDetail.
- **`scrubber.spec.ts`, `ui-features.spec.ts`, `visual-baseline.spec.ts`**
  — should be insensitive to history changes; if they break, that's a
  signal something deeper went wrong (mount-time race, accidental
  re-render loop). Don't ignore.

**Unit tests** (under `kupua/src/**/*.test.ts(x)`): run the full suite
each iteration. Specific files to expect reaction from:

- `lib/orchestration/search.test.ts` (or similar) if it covers
  `markUserInitiatedNavigation` / `consumeUserInitiatedFlag` — items 2
  and 3 add helpers next to these and the contract should still hold.
- `hooks/useUrlSearchSync.test.ts` (or similar) — popstate/dedup logic.
  Item 1's `history.back()` re-enters this hook; the user-initiated
  marker must reach it.
- Anything testing `reset-to-home.ts` — item 3 rearranges callers.

**Test-the-test, don't fix-the-test.** If an existing assertion breaks,
the default move is to investigate whether the production behaviour is
actually wrong. Only update test code when the test's expectation no
longer reflects the *intended* behaviour after this work — and document
the change in the changelog narrative. If a test is asserting the old
"close button replaces" semantics, that assertion is now stale and
*should* be updated; that's expected. If a test is asserting "focus is
preserved on back from detail" and that breaks, you have a real
regression.

## Deliverables

1. The five baseline items implemented and tested. The two helpers
   (`pushNavigate`, `pushNavigateAsPopstate`) live alongside
   `markUserInitiatedNavigation` in `lib/orchestration/search.ts` (or a
   new sibling file if that one is getting crowded — your call, but
   keep them together).
2. Updated audit table in [browser-history-analysis.md](./browser-history-analysis.md) reflecting post-change reality (the "Today's back/forward behaviour" column should describe the new behaviour, not the old).
3. Updated `e2e/local/browser-history.spec.ts` (or split into multiple spec files if it gets too long).
4. Updated [browser-history-analysis.md](./browser-history-analysis.md) more broadly to reflect the new state — mark the "Baseline tightening" section as completed (don't delete it; future readers benefit from seeing what was done), and update the "History entry rules" table to match the new reality.
5. Per AGENTS.md directive: append narrative to [changelog.md](./changelog.md), update AGENTS.md if architecture changes warrant it.
6. **Do not delete this handoff file** until the user confirms. After confirmation, the analysis doc captures the outcome and this handoff can go.

## Things you might think are problems but aren't

- **TanStack Router state.** TSR 1.168 manages `history.state` for its own keys. `history.back()` will fire its `popstate` handler normally; you don't need to interact with TSR's state object. Just call `markUserInitiatedNavigation()` before `history.back()` so `useUrlSearchSync` doesn't treat the resulting effect as a popstate-driven reset.
- **`density` is a display key but pushes.** This is intentional per the guiding philosophy (density is a useful view). The `URL_DISPLAY_KEYS` set governs whether a key change triggers re-search, not whether it pushes. Don't conflate them.
- **`__kupua_router__` and `__kupua_markUserNav__`.** Dev-only globals exposed in `main.tsx`. E2E tests use `__kupua_markUserNav__` to simulate user-initiated navigations. If you change the user-initiated flag mechanism, update the dev global accordingly.
- **`suppressNextRestore`.** A safety valve used by `resetToHome()`. Not history-related per se but interacts with the logo-reset path. Don't remove it; understand what it does (see analysis doc).

## Things that might be problems and probably are

- **`history.back()` is async.** Unlike `navigate({ replace: true })`. Anywhere you currently rely on close completing synchronously (e.g. measuring something immediately after), you may need to defer to the next tick or wait for popstate. The `useSwipeDismiss` interaction (per changelog 23 April 2026) is the most likely place this matters — read that changelog entry before touching the swipe path.
- **Mount-time history synthesis may race with TSR's own initial setup.** TSR runs its own router-mount logic. Doing `replaceState` + `pushState` immediately on first mount needs to happen *after* TSR is settled but *before* the user can interact. Test on cold loads, hot reloads, and bfcache restores.
- **`history.length` semantics.** Includes the new-tab blank entry on some browsers and not others. Test in both Chrome and Firefox before assuming `=== 1` is the right gate. May need `<= 2` or other heuristic.

## When to stop and ask

Per the directive: ask rather than spiral. Specifically:

- If the audit table contains a row whose intent you can't infer from the
  decisions captured in the analysis doc, ask before guessing.
- If you discover a history-touching site **not** in the audit table.
- If `history.back()` interacts badly with `useSwipeDismiss` or any other
  handler in a way that requires significant refactor.
- If e2e tests require restructuring the spec file beyond cosmetic changes.
- If the deep-link synthesis turns out to flicker on either Chrome or
  Firefox despite the coalescing assumption — stop and report; don't
  paper over it.

The user prefers being asked over the agent committing to a wrong approach.
