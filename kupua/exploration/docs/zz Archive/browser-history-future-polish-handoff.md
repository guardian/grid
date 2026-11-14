# Handoff — Browser history Future polish (snapshot-based position restoration)

This is a self-contained brief for the agent(s) implementing position
restoration on browser back/forward. **Read this whole file, then read
the "Future polish" section of [browser-history-analysis.md](./browser-history-analysis.md)
in full.** That section is the source of truth for the design; this
handoff frames the task, sequences it across sessions, and flags the
gotchas.

**Status as of 26 April 2026:** Phases 1–3 complete (uncommitted). All
390 unit tests and 177 e2e tests pass. Three bugs discovered and fixed
during Phase 3 manual testing:
1. Deep-link synthesis re-fire on popstate (`_bareListSynthesized` stamp)
2. Missing departing snapshot on popstate (`_lastKupuaKey` tracker)
3. Phantom-to-explicit focus promotion on restore (`anchorIsPhantom` flag)

Known open issue: **phantom anchor drift on repeated back/forward** —
position preservation without focus drifts on repeated cycles. Works
correctly everywhere else in the app. Documented in
`phantom-drift-investigation.md` with three attempted fixes (all reverted),
root cause hypothesis, and proposed automated test approach.

Phase 4 (reload survival) is next. The `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD`
flag is already wired and default ON — reload survival works accidentally
because the popstate departing-snapshot capture + SessionStorageSnapshotStore
means first-mount can find a snapshot. Phase 4 adds the intentional mount-time
restore branch + e2e coverage + bfcache verification.

**Audience:** designed for multi-session, multi-agent execution. The user
will likely use Opus 4.6. Each session begins with the "Fresh agent
protocol" (`.github/copilot-instructions.md`) — greet, read this file,
read the worklog, ask before writing code. Each phase below is
independently shippable; commit at phase boundaries (with explicit user
approval per directive).

## Goal

Land back/forward (and reload, when persistence is on) closer to where
the user left each search context, instead of resetting to offset 0.
The mechanism is a per-history-entry snapshot captured before each push
and consumed on popstate. All capabilities the snapshot needs already
exist in the store and the offset cache (`seek`,
`restoreAroundCursor`, `extractSortValues`, `buildSearchKey`,
`getViewportAnchorId`, `suppressNextRestore`) — no new ES capabilities,
no store refactor.

Do **not** implement the "traversal entry-point bookmark" hypothetical
in the analysis doc. It is deferred indefinitely — its mechanics are
documented for a possible future session, not this one.

## What to read first (in order)

1. **This file.**
2. **"Future polish" section of [browser-history-analysis.md](./browser-history-analysis.md)** — the whole section, including:
   - "Decisions taken (closed)" — six final decisions. Treat as binding.
   - "Compile-time flags" — three flags (one permanent, two
     `EXPERIMENTAL_` prefix). Names, default values, decide-and-delete
     expectation.
   - "Per-entry identity — we mint our own `kupuaKey`" — why TSR's
     `state.key` is unusable and how `kupuaKey` solves it.
   - "Capture point", "Restore point", "Anchor selection",
     "Storage", "Subtlety: debounced typing snapshot timing" — the
     mechanics.
   - Scenario tables (Series 1–5) — concrete behaviour expectations
     against which to write e2es.
   - Implementation outline + Discovery items + Risks + Effort sizing.
3. **The rest of the analysis doc** — especially "Guiding philosophy",
   "History entry rules", and the audit table from the baseline
   section. The audit table is your snapshot-capture checklist:
   every row whose action is `push` and which marks user-initiated is
   automatically covered by folding `markPushSnapshot()` into
   `useUpdateSearchParams` and `pushNavigate`. **Don't re-audit.**
4. **The five "Key files" listed in the analysis doc.** Read them in
   full, not snippets:
   - `kupua/src/lib/orchestration/search.ts` — where
     `markUserInitiatedNavigation`, `pushNavigate`,
     `pushNavigateAsPopstate` already live; `markPushSnapshot` and
     friends go here.
   - `kupua/src/hooks/useUrlSearchSync.ts` — popstate consumption.
   - `kupua/src/lib/image-offset-cache.ts` — for `buildSearchKey` and
     `extractSortValues` reuse.
   - `kupua/src/stores/search-store.ts` — `seek`,
     `restoreAroundCursor`, `suppressNextRestore`.
   - `kupua/src/main.tsx` — dev globals (`__kupua_router__`,
     `__kupua_markUserNav__`).
5. [`kupua/e2e/local/browser-history.spec.ts`](../../e2e/local/browser-history.spec.ts) — the existing 15 tests. New tests extend this file.
6. [`kupua/exploration/docs/changelog.md`](./changelog.md) — for the baseline-tightening narrative; the new work appends here too.
7. [`kupua/exploration/docs/snapshot-restore-prior-art.md`](./snapshot-restore-prior-art.md) — **if it exists**, read it. Reusable tech, conceptual guidance, and cautionary tales mined from earlier position-restoration work. Especially relevant to Phase 3's render gate.

## The task, restated — closed decisions

| # | Decision | What it means in code |
|---|---|---|
| 1 | Traversal entry-point bookmark — DEFERRED | Don't implement Option α. The hypothetical stays in the doc as future reference. |
| 2 | Reload survival — BUILD INFRA, FLAG DEFAULT ON | `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD = true` in snapshot module. `snapshotStore` interface with two impls (`Map`-backed, sessionStorage-backed). **Permanent product knob.** |
| 3 | `metadata-click-to-search` anchor — focused image X | Non-question; falls out of normal anchor rule. |
| 4 | Async total clamp — snap to final, never intermediate | Popstate holds render until count + buffer settle; one commit. |
| 5 | `searchKey` mismatch — LENIENT, default ON, behind a flag | `EXPERIMENTAL_LENIENT_SEARCHKEY_MATCH = true`. Try `restoreAroundCursor(anchor)` even on fingerprint mismatch; fall back to reset-to-top only if cursor doesn't resolve. **Decide-and-delete within first week of dogfooding.** |
| 6 | Anchor priority — focus-as-anchor in click-to-focus, viewport in click-to-open, default ON, behind a flag | `EXPERIMENTAL_FOCUS_AS_ANCHOR_IN_CLICK_TO_FOCUS = true`. Off branch: both modes use viewport anchor. **Decide-and-delete within first week of dogfooding.** |

## Compile-time flags — naming convention

Three flags total. Permanent flags = bare name. **Experimental flags =
`EXPERIMENTAL_` prefix.** The prefix is the forcing function; it should
embarrass the codebase the longer it sits there. Decide-and-delete
target: first week of dogfooding.

```ts
// Permanent product knob — sessionStorage-backed snapshots survive reload.
// Switch to false to debug whether a bug is storage-tier-related.
const PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD = true;

// EXPERIMENTAL — try restoreAroundCursor on partial searchKey mismatch.
// Decide-and-delete within first week of dogfooding. If kept: rename to
// LENIENT_SEARCHKEY_MATCH and drop the prefix. If rejected: delete this
// branch and the surrounding `if`.
const EXPERIMENTAL_LENIENT_SEARCHKEY_MATCH = true;

// EXPERIMENTAL — anchor by focused image in click-to-focus mode (vs viewport
// anchor for both modes). Decide-and-delete within first week of dogfooding.
const EXPERIMENTAL_FOCUS_AS_ANCHOR_IN_CLICK_TO_FOCUS = true;
```

Use these exact names; the analysis doc references them.

## API & invariants Opus might miss

Tightening points that fall between the cracks of the phased plan:

- **`history.scrollRestoration = 'manual'` is mandatory.** Set it once
  in `main.tsx` near the top, before any router setup. The browser's
  default `'auto'` will fight our restore on popstate by re-applying
  the previously saved scroll position one frame after we've seeked.
  One line; easy to forget; symptoms look like the snapshot restore is
  broken when it's actually the browser overwriting us.
- **Cold-load `kupuaKey` mint is `if-absent-only`.** Always check
  `router.history.location.state.kupuaKey` first; only mint+replaceState
  if absent. This is load-bearing for reload survival: `history.state`
  is persisted by the browser per entry across reload, so the key from
  the pre-reload session is still there. If we always mint a fresh key
  on mount, Phase 4's mount-time restore lookup never hits.
- **`markPushSnapshot()` reads the predecessor `kupuaKey` itself,
  internally.** Don't make callers pass it. Inside the function:
  read `router.history.location.state.kupuaKey` (this IS the
  predecessor — we haven't navigated yet), build the snapshot from
  current store state, write to `snapshotStore` keyed by that
  predecessor key, then return. Caller's only job is "call this
  before `navigate()`".
- **No `consumeSnapshot` helper.** Phase 3 reads directly from
  `snapshotStore.get(kupuaKey)`. The store does NOT delete on read;
  snapshots stay until LRU evicts them (so forward navigation can
  re-restore the same entry). Strike `consumeSnapshot` from
  Deliverables; it's an artifact of an earlier draft.
- **`pushNavigate` signature change.** The helper currently takes
  whatever TSR's `navigate` accepts. Phase 1 needs it to inject
  `state: { kupuaKey: <minted> }` into the options before calling
  `navigate`. If the call site already passes its own `state`,
  shallow-merge: `{ ...callerState, kupuaKey }`. Test the
  caller-state-merge case explicitly (currently no caller does, but
  the helper should be future-safe).
- **Why logo-reset still mints a fresh `kupuaKey`.** It doesn't
  capture a snapshot for itself, but the **next** push from the
  reset entry needs a predecessor key to capture against. So:
  `pushNavigateAsPopstate` mints, `markPushSnapshot` skips. (Don't
  remove this "for cleanup" — it's structural.)
- **Render-gate UX during the gate.** The existing sort-around-focus
  path (Phase 3) keeps the **old buffer visible** during the hold
  with `loading: true` set on the store. The user sees the previous
  search context's content frozen for one or two frames, then it
  snaps to the restored position. View consumers checking `loading`
  will see it during the gate — fine, matches the existing reload
  restore path. No new timeout / fallback infrastructure needed; the
  existing `_findFocusAbortController` and `_seekCooldownUntil`
  handle aborts and concurrency.
- **What "flag is `false`" actually means after baseline.** Three
  cases, only one of which has a snapshot to look up:
  1. **Real popstate** (back/forward) — read snapshot for current
     `kupuaKey`. Restore or fall through to reset.
  2. **Logo-reset push** (`pushNavigateAsPopstate`) — current
     `kupuaKey` is freshly-minted; no snapshot exists for it; falls
     through to reset-to-top. Correct by construction.
  3. **Default-injection replace** — current `kupuaKey` is preserved
     across the replace; if a snapshot exists for it (from a prior
     push), it'll be looked up. The replace itself is a one-off
     mount redirect (`/` → `/search?nonFree=true`), so no
     pre-existing snapshot exists in practice — falls through to
     reset-to-top. Correct.

  In all three, the lookup-then-fall-through path is the same code,
  no special-casing needed. Just write the lookup once and trust the
  store to return `undefined` for the cases that have nothing.
- **`scrollTop` fallback on the snapshot.** Used only when both
  `anchorImageId` and `anchorCursor` are null — i.e. empty result
  set at push time, or a sort field that `extractSortValues` can't
  handle. Apply via `window.scrollTo(0, scrollTop)` after the
  buffer settles. Rare path; test once.

## Implementation phases

Five phases, sequenced. Each ends in a commit-worthy state (with
explicit user approval per directive). Phases are independently
testable. The user may run them across multiple sessions / agents;
each session should pick up at the next unstarted phase.

### Phase 1 — `kupuaKey` infrastructure (no behaviour change)

**Smallest possible end-to-end: a stable per-entry identifier we
control.**

- Pick a UUID source (use `crypto.randomUUID()` — it's available in all
  evergreen browsers and avoids adding a dep).
- Add `withCurrentKupuaKey(state?)` helper in
  `lib/orchestration/search.ts` (or a new sibling
  `lib/orchestration/history-key.ts` — your call). Reads
  `router.history.location.state.kupuaKey` (if any) and returns a
  state object suitable to pass to TSR navigate's `state` option.
- Add `mintKupuaKey()` for the push case.
- **Modify `pushNavigate`** to mint a fresh `kupuaKey` and pass it via
  `state`.
- **Modify `useUpdateSearchParams`** to mint on push, re-pass on
  replace, via the helpers.
- **Modify replace-only sites** (`traversal-onNavigate`,
  `default-injection`) to use `withCurrentKupuaKey` so the existing
  key survives.
- **Modify `pushNavigateAsPopstate`** (logo-reset) to mint a fresh
  key — even though it skips snapshot capture, it should still get a
  unique key so the next push can read a stable predecessor. (If
  this turns out to be unneeded, remove it later.)
- **Cold-load synthesis:** in `useLayoutEffect` near top of app
  mount, if `router.history.location.state.kupuaKey` is absent, mint
  one and `replaceState` it in. This must run before any other
  history mutation. The existing deep-link synthesis effect in
  `ImageDetail` is a good model for ordering.
- **Discovery item to verify in this phase:** does TSR's
  `NavigateOptions['state']` accept arbitrary fields? It should
  (TanStack types historically use a permissive `HistoryState`
  shape). If TypeScript rejects it, two options:
  1. Cast (acceptable; the runtime contract is documented in the
     `@tanstack/history` source).
  2. Bypass TSR and call `window.history.replaceState` directly to
     inject the key, then continue with TSR navigate.
- **Tests for this phase:**
  - Unit: `lib/orchestration/history-key.test.ts` covering mint /
    re-pass / cold-load synthesis edge cases.
  - E2E: extend `browser-history.spec.ts` with one test asserting
    `router.history.location.state.kupuaKey` is present and stable
    across replace navigations (debounced typing follow-up
    keystrokes, traversal). Reuse the dev-globals pattern.
- **Acceptance:** all existing 15 e2e tests still pass, all unit
  tests still pass, every history entry has a `kupuaKey` that
  survives replace.

**Commit message hint:** "Mint a stable per-entry kupuaKey carried
through TanStack Router navigate state, surviving replace operations."

### Phase 2 — snapshot store + capture on push (still no popstate behaviour change)

Once Phase 1 is in, snapshots can be captured but nothing reads them.
This phase is "scaffolding only" and lets us inspect snapshot content
in DevTools before wiring up restore.

- Define `HistorySnapshot` type per the doc (`searchKey`,
  `anchorImageId`, `anchorCursor`, `anchorOffset`, `scrollTop`).
- Define `SnapshotStore` interface (`get`, `set`, `delete`).
- Implement `MapSnapshotStore` (LRU, cap ~50 entries).
- Implement `SessionStorageSnapshotStore` under
  `kupua:histSnap:<kupuaKey>`. Same LRU cap. On JSON parse failure,
  delete the entry and continue.
- Selector via `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD`. Both impls live
  in the source; the unused one is dead code — that's intentional so
  flipping the flag for debugging requires no rebuild beyond a single
  const flip.
- New helper in `lib/orchestration/search.ts`:
  `markPushSnapshot(snap: HistorySnapshot | null)` — writes via the
  store, keyed by the **predecessor** kupuaKey (the entry being left).
  This is subtle: when we push, we capture snapshot for the entry we
  are leaving, not the new entry. The new entry will be snapshotted on
  *its* next push (or end up at offset 0 if user's session ends there).
- Add a small builder: `buildHistorySnapshot()` in a new file
  `lib/history-snapshot.ts`. Reads from the search store + viewport
  anchor + flag-gated anchor selector to produce the snapshot.
  Tested as a pure function with mocked store/viewport.
- **Fold capture into the push helpers:**
  - `pushNavigate(args)` → `const snap = buildHistorySnapshot(); markPushSnapshot(snap); markUserInitiatedNavigation(); navigate(args);`
  - `useUpdateSearchParams` push branch → same.
  - **NOT** in `pushNavigateAsPopstate` (logo-reset; it intentionally
    skips snapshot to land at offset 0).
  - **NOT** in replace branches (the predecessor's snapshot remains
    valid because the kupuaKey is preserved).
- **Subtlety: debounced typing.** The first-keystroke push captures
  the predecessor (pre-edit state) — the URL being committed as a
  back target. Subsequent keystroke replaces don't capture. This
  happens naturally because `markPushSnapshot` is called inside the
  helper before the navigate fires; the store is still showing
  pre-edit state when `buildHistorySnapshot` reads it. **Add a code
  comment** at the read site so future edits don't reorder the read
  after the navigate.
- **Tests for this phase:**
  - Unit: `lib/history-snapshot.test.ts` covering anchor selection
    rules (flag on/off × click-to-focus / click-to-open).
  - Unit: `MapSnapshotStore.test.ts` covering LRU eviction.
  - Unit: `SessionStorageSnapshotStore.test.ts` covering JSON
    round-trip + fingerprint mismatch handling.
  - E2E: extend `browser-history.spec.ts` with a test that exposes a
    dev-only `__kupua_inspectSnapshot__(kupuaKey)` global (gated on
    `import.meta.env.DEV` like the existing dev globals) and asserts
    that pushing a search captures the expected snapshot for the
    predecessor entry.
- **Acceptance:** all existing tests still pass. Snapshots are
  captured but unused — popstate behaviour is unchanged.

**Commit message hint:** "Capture per-entry history snapshots on push;
no consumer yet."

### Phase 3 — restore on popstate (behaviour change starts here)

This is where users start seeing the new behaviour. Originally flagged
as the highest-risk phase, but **prior-art discovery
([snapshot-restore-prior-art.md](./snapshot-restore-prior-art.md))
shows the render gate is essentially already built.** The
sort-around-focus path inside `search()` (`search-store.ts:L1749-1770`)
already holds `loading: true`, defers `total/results/bufferOffset`,
and commits atomically when `_findAndFocusImage` resolves. Reuse it.

- In `useUrlSearchSync`, when `consumeUserInitiatedFlag()` returns
  `false` (popstate or programmatic) — see "What 'flag is `false`'
  actually means after baseline" above for the three concrete cases:
  1. Read `router.history.location.state.kupuaKey`.
  2. **Honour `suppressNextRestore`.** If the store has the suppress
     flag set (logo-reset path), skip restore. The flag's existing
     consumer in `restoreAroundCursor` will also no-op us if we get
     past this check, but checking here avoids the wasted store call.
  3. `snapshotStore.get(kupuaKey)`.
  4. If absent → existing reset-to-top path (today's behaviour).
  5. If present and `snapshot.searchKey === buildSearchKey(searchParams)` → strict restore (see below).
  6. If present and mismatch and `EXPERIMENTAL_LENIENT_SEARCHKEY_MATCH === true` → still attempt the same restore path; the cursor either resolves (we land near anchor) or `restoreAroundCursor` falls back to `seek(offset)` internally.
  7. If present and mismatch and lenient flag is `false` → reset to top (strict branch).
- **Restore mechanism — route through the sort-around-focus gate.**
  Instead of inventing a `_pendingSnapshotRestore` flag, **pass the
  snapshot's `anchorImageId` as `sortAroundFocusId` into `search()`,
  with `anchorCursor` + `anchorOffset` as hints to skip the
  `countBefore` round-trip.** The existing render gate engages
  automatically:
  - Old buffer stays visible until `_findAndFocusImage` completes.
  - `total`, `results`, `bufferOffset` deferred to a single atomic
    `set()`.
  - Concurrency handled by existing `_findFocusAbortController`,
    `_seekCooldownUntil`, `_seekGeneration`.
  - `loading: true` is set during the gate — view consumers checking
    `loading` will see it. This is fine (the existing reload restore
    path does the same), but document it so future readers don't
    confuse it for "stuck loading".
- **Implementation note for `search()`/`_findAndFocusImage`:** today
  the function does its own `countBefore(cursor)` to find the global
  index. The snapshot provides `anchorOffset` already — extend
  `_findAndFocusImage` to accept an optional `hintOffset` parameter
  that short-circuits the `countBefore` when present. If the hint is
  stale (lenient mismatch with shifted offsets), the function should
  still fall through to its existing `countBefore` path.
- **`_seekTargetGlobalIndex` must be correct for current scroll mode.**
  See [snapshot-restore-prior-art.md](./snapshot-restore-prior-art.md)
  cautionary tale C2 — a wrong global index in two-tier mode caused
  a 20-round-trip infinite restore loop. The hint-offset path must
  set this correctly for both buffer mode and two-tier mode.
- **Restore preference (anchor → offset → scrollTop):**
  - `restoreAroundCursor(anchorImageId, anchorCursor, anchorOffset)`
    if anchor exists. Already calls into the same internal path as
    `sortAroundFocusId` would.
  - Else `seek(snapshot.anchorOffset)` if offset is known.
  - Else `window.scrollTo(0, snapshot.scrollTop)` after buffer
    settles (rare path; empty result set at capture, or sort field
    `extractSortValues` couldn't handle).
- **Display-only changes still skip restore.** The dedup guard in
  `useUrlSearchSync` fires before any of this; back-from-image-detail
  uses today's cheaper Case A path.
- **Tests for this phase:** extend `browser-history.spec.ts` with:
  - **Series 1** — filter then back: scroll to ~#800 (use
    deep-seek dev global if available; else scroll), toggle filter,
    back, assert focus / scroll near #800.
  - **Series 2** — sort change: same shape with sort.
  - **Series 4** — multiple deep dives: three contexts, back-back,
    forward.
  - **Strict mismatch** (with `EXPERIMENTAL_LENIENT_SEARCHKEY_MATCH = false` for the test): hand-edit URL between push and pop, assert reset-to-top.
  - **Lenient mismatch** (default flag): same scenario, assert
    cursor-resolved restore.
  - **Logo-reset back (Series 5):** assert today's logo-reset still
    resets correctly *and* back from the reset entry restores into
    the previous context's snapshot. Verify
    `suppressNextRestore` doesn't accidentally suppress the
    restore *back* from the logo-reset entry. Existing tests #13
    and #14 should be extended or supplemented.
- **Regressions to watch (high risk):**
  - `phantom-focus.spec.ts` — restore changes what gets focused on
    popstate. Note: the existing
    [phantom focus → `getViewportAnchorId()`](./snapshot-restore-prior-art.md#7-getvisibleimageids----usedatawindowtsl172)
    fallback in `useUrlSearchSync` (commit `4baad73eb`) is the
    template for our anchor selection — minimal new code needed
    in click-to-open mode.
  - `focus-preservation.spec.ts` — "Never Lost" should be
    unaffected (it's a push-time mechanism), but verify.
  - `buffer-corruption.spec.ts` — render gate timing intersects
    buffer setup; lower risk now that we reuse the existing gate.
  - `keyboard-nav.spec.ts` — Backspace inside detail re-enters
    `useUrlSearchSync`.
- **Acceptance:** scenario tables match production behaviour.
  All existing 15 history tests still pass (some may need extension,
  not modification). All other e2e specs above still pass.

**Commit message hint:** "Restore scroll position from per-entry
snapshots on browser back/forward (via existing sort-around-focus
render gate)."

### Phase 4 — reload survival (turn on persistence-backed flag)

Phases 1–3 ship with `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD = true`
from day one (the in-memory impl is dead code in production, kept
as a debug knob). Phase 4 is about *exercising* the reload path with
e2e coverage and bfcache verification.

- **Bfcache verification.** Add a Playwright test:
  - Open kupua, navigate to a search context, scroll to ~#500.
  - Navigate to a different origin
    (`page.goto('about:blank')` or similar).
  - `page.goBack()`.
  - Assert the snapshot for the current `kupuaKey` is intact in
    `sessionStorage` *and* (separately) in the in-memory Map (toggle
    `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD = false` for that test
    via build-time injection or two test runs).
  - This answers the deferred discovery question: does bfcache
    preserve the in-memory Map? If yes, the in-memory impl is
    viable as a debug knob without breaking bfcache. If no, the
    in-memory impl is *only* useful for non-bfcache navigations and
    that's worth a code comment.
- **Reload survival e2e:** for each of Series 1, 2, 4 add a
  `.reload()` variant:
  - Push, scroll, push again, **`page.reload()`** instead of
    push/back, assert restore of the *current* entry's snapshot
    (not back/forward — the same entry).
  - Then back, assert previous-entry snapshot still restores.
  - This exercises the "on mount, look up current entry's snapshot
    and restore" branch (separate from the popstate branch).
- **Mount-time restore branch.** When `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD === true`:
  - On app mount (after `kupuaKey` synthesis), look up
    `snapshotStore.get(kupuaKey)`.
  - If `snapshot.searchKey === buildSearchKey(searchParams)`
    (strict; lenient flag does NOT apply on mount because there's
    no popstate context — the URL is what it is), restore via the
    same code path as popstate.
  - If miss or mismatch → today's mount behaviour (cold start at
    offset 0).
  - This branch is deliberately additive; if it breaks something,
    flip `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD = false` to disable.

**Commit message hint:** "Restore scroll position on reload via
sessionStorage-persisted history snapshots."

### Phase 5 — dogfooding window + flag retirement

After 3–7 days of real use:

- **Decide on `EXPERIMENTAL_LENIENT_SEARCHKEY_MATCH`.**
  - Kept → rename to `LENIENT_SEARCHKEY_MATCH` (drop prefix), update
    code comment.
  - Rejected → delete the lenient branch and the surrounding `if`.
- **Decide on `EXPERIMENTAL_FOCUS_AS_ANCHOR_IN_CLICK_TO_FOCUS`.**
  - Kept → rename, drop prefix, update comment.
  - Rejected → delete the branch.
- **Don't decide on `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD`** — it's
  permanent.
- Update analysis doc to reflect retired flags. Update changelog.

This phase is owned by the user, not the implementing agent. Mention
it in the commit message so the user knows the clock has started.

## Non-negotiable constraints

- **Snap to final, never intermediate.** No frame at offset 0 between
  popstate and the restored target. Achieved by routing through the
  existing sort-around-focus gate in `search()` — see Phase 3 detail
  and prior-art doc.
- **Don't build a parallel restore path.** The existing
  `restoreAroundCursor` → `_seekGeneration` → Effect #9 chain handles
  scroll modes, two-tier, density focus, and scrubber positioning
  correctly. Cautionary tale C5 documents a reverted parallel attempt.
- **Compute `_seekTargetGlobalIndex` correctly for current scroll mode.**
  Cautionary tale C2: hardcoded `-1` in two-tier mode caused a
  20-round-trip infinite restore loop. The hint-offset path in Phase 3
  must set this correctly for both buffer mode and two-tier mode.
- **Honour `suppressNextRestore` in the popstate restore path.**
  Cautionary tale C1: missing this guard caused Home-button flicker
  (briefly home, snaps to deep). Phase 3 must check it.
- **TSR's `state.key` is unsuitable as identity.** Always read/write
  via `kupuaKey`. Don't be tempted to use TSR's key "just for now" —
  it changes on every replace and will silently break debounced-typing
  follow-ups, traversal, and the default-injection redirect.
- **`pushNavigateAsPopstate` (logo-reset) does NOT capture a snapshot.**
  Its whole point is to land the next entry at offset 0 with no
  carried focus. If you accidentally fold capture into it, Series 5
  will break.
- **Display-only key changes still bypass restore.** The dedup guard
  is the cheap path for back-from-image-detail (Case A); don't
  remove it.
- **Don't break the popstate-vs-user-initiated distinction.** The
  baseline tightening work depends on it; the snapshot work depends
  on the baseline. If you change `consumeUserInitiatedFlag` semantics,
  stop and ask.
- **Never write to non-local Elasticsearch.** Standard kupua directive
  per `.github/copilot-instructions.md`. Snapshot work is read-only on
  the data side.

## Test discipline

Per the directive in `.github/copilot-instructions.md` (read it; it's
the source of truth). Summary tailored to this work:

- **Always use the npm scripts** via `npm --prefix kupua run <script>`
  from repo root. npm scripts run with cwd=`kupua/` so configs and
  artefacts resolve correctly.
- **Never** `cd kupua && ...`, **never** `npm --prefix kupua exec`,
  **never** bare `npx playwright`/`vitest` — those keep cwd at repo
  root and dump `test-results/`/`playwright-report/` there. Repo root
  is verboten per the kupua-only scope directive.
- Tee to absolute `/tmp/kupua-test-output.txt`. Foreground. Don't
  re-run a running test — `read_file /tmp/kupua-test-output.txt`.
- Unit: `npm --prefix kupua test 2>&1 | tee /tmp/kupua-test-output.txt`
  after any `kupua/src/` change.
- Playwright: `npm --prefix kupua run test:e2e 2>&1 | tee /tmp/kupua-test-output.txt`
  after any history / snapshot change. Stop dev server on :3000 first.
- **Failure detection: if `*.txt`, `test-results/`, or
  `playwright-report/` appear at repo root after a run, you got cwd
  wrong. Stop, delete the stray files, retry. Do not commit.**

**Perceived-perf surfaces:** Phase 3's render gate touches
orchestration timing. After Phase 3 lands, suggest the user run the
perceived-perf audit (`npm --prefix kupua run test:perf -- --perceived-only --runs 3 --label "future-polish-restore"`). Per directive, the agent suggests; the user runs.

### Regression watchlist — existing tests this work could break

**E2E specs likely to react** (under `kupua/e2e/local/`):

- **`browser-history.spec.ts`** — the existing 15 tests. Phases 2 and
  3 add capture and restore; tests #1, #2, #3, #4, #13, #14, #15 all
  exercise paths where snapshots are now captured. They should still
  pass — capture is invisible without restore (Phase 2), and restore
  should preserve their assertions (Phase 3) because each test
  navigates from a known state and asserts a known outcome that the
  snapshot mechanism makes *better*, not different.
- **`focus-preservation.spec.ts`** — "Never Lost" is a push-time
  mechanism (focus carries forward through filter changes); snapshot
  capture happens at the same push site but doesn't change what
  `setParams` does. Should be unaffected. If it breaks, the snapshot
  read is reordered after the navigate (see Phase 2 comment).
- **`phantom-focus.spec.ts`** — high-risk. Phantom focus interacts
  with restore-via-anchor. Specifically, the
  `EXPERIMENTAL_FOCUS_AS_ANCHOR_IN_CLICK_TO_FOCUS` flag changes which
  image becomes the anchor in click-to-focus mode; phantom-focus tests
  may need updating to assert the new behaviour explicitly (and
  separately for flag on/off).
- **`buffer-corruption.spec.ts`** — render gate timing intersects
  buffer setup. Phase 3 is where this is most likely to break.
- **`keyboard-nav.spec.ts`** — Backspace inside detail re-enters
  `useUrlSearchSync`; restore now runs there.
- **`scrubber.spec.ts`, `ui-features.spec.ts`,
  `visual-baseline.spec.ts`** — should be insensitive. If they break,
  investigate; don't paper over.

**Unit tests** (under `kupua/src/**/*.test.ts(x)`): run the full suite
each iteration. Specific reaction expected from:

- `lib/orchestration/search.test.ts` — covers user-initiated flag;
  add coverage for `markPushSnapshot` (predecessor-key resolution,
  store write).
- `hooks/useUrlSearchSync.test.ts` — popstate logic; add coverage
  for snapshot consumption (lookup, restore preference, fall-through
  to reset-to-top).
- New tests: `lib/history-snapshot.test.ts`,
  `lib/orchestration/history-key.test.ts`,
  `lib/snapshot-store.test.ts` (or similar split).

**Test-the-test, don't fix-the-test.** If an existing assertion
breaks, the default move is to investigate whether the production
behaviour is actually wrong. Update test code only when the
expectation no longer reflects the *intended* behaviour after this
work — and document the change in changelog narrative.

## Deliverables (across all phases)

1. **Phase 1:** `kupuaKey` infrastructure in
   `lib/orchestration/search.ts` (or new sibling file). Cold-load
   synthesis. Unit tests. One e2e for kupuaKey persistence across
   replaces.
2. **Phase 2:** `HistorySnapshot` type, `SnapshotStore` interface +
   two impls, `markPushSnapshot` helper, `buildHistorySnapshot()`
   builder, capture wiring in push helpers. Unit tests for builder +
   stores. One e2e via dev-global inspector.
3. **Phase 3:** Restore in `useUrlSearchSync`. Render gate. Five new
   e2es (Series 1, 2, 4, strict mismatch, lenient mismatch). Updated
   tests #13 / #14 if needed.
4. **Phase 4:** Bfcache verification e2e. Reload-survival e2e
   variants for Series 1, 2, 4. Mount-time restore branch.
5. **Phase 5:** User-driven flag retirement; agent updates code
   comments + analysis doc + changelog when user decides.
6. **All phases:** Update analysis doc to reflect post-implementation
   reality (mark "Future polish" as ✅ COMPLETE; move forward
   anything that's no longer "future"). Per AGENTS.md directive:
   append narrative to `changelog.md`; update `AGENTS.md` if
   architecture changes warrant.
7. **Don't delete this handoff file** until the user confirms all
   phases land. After confirmation, the analysis doc captures the
   outcome and this handoff can go.

## Things you might think are problems but aren't

- **TSR mints a fresh `state.key` on replace.** Verified, intentional,
  semver-safe (1.x will keep this behaviour). That's exactly why we
  have `kupuaKey`. Don't try to "fix" TSR or wrap its key — they're
  designed for action-matching, not entry-identity.
- **Snapshot for predecessor, not new entry.** When you push, you
  snapshot the entry you're leaving. The new entry's snapshot will be
  written when *it* is left. This feels asymmetric but is correct: at
  push time, the new entry has no scroll/anchor data yet — there's
  literally nothing to snapshot.
- **`PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD = false` ships in production
  as dead code.** Intentional. It's a debug knob: flipping the const
  rebuilds with the in-memory impl, no other change needed. The dead
  code bundles into ~50 lines of unreachable JS — fine.
- **`suppressNextRestore` may interact with snapshot restore.** The
  logo-reset path sets it; it aborts in-flight `restoreAroundCursor`
  calls. Snapshot restore *uses* `restoreAroundCursor`, so the flag
  applies naturally — back from a logo-reset still restores the
  previous entry's snapshot (Series 5). Don't remove the flag.
  **However** — cautionary tale C1 — you must explicitly check
  the flag in the popstate restore path before the store call, so
  the wasted lookup is avoided. The flag's existing in-store check
  is a backstop, not the primary guard.
- **`loading: true` exposure during the render gate.** Routing
  Phase 3 through the sort-around-focus gate sets `loading: true`
  on the store while the anchor neighbourhood loads. The view's
  loading-spinner / skeleton consumers will react. This matches the
  existing reload restore path's behaviour (the offset cache uses
  the same gate). It's not a bug; document it in Phase 3 code
  comments so future readers don't try to suppress it.
- **Phantom focus path is already wired.**
  `useUrlSearchSync` already falls back to `getViewportAnchorId()`
  when no focused image exists, passing it as `sortAroundFocusId`
  to `search()` (`useUrlSearchSync.ts:L148-154`, commit
  `4baad73eb`). Phase 2's anchor selection is mostly
  flag-gating which existing branch to take, not new code.

## Things that might be problems and probably are

- **Render gate (Phase 3) — use the existing one.** The sort-around-focus
  path in `search()` (`search-store.ts:L1749-1770`) already implements
  exactly what we need (atomic commit, deferred `total`, isolated
  abort controller). **Do not invent a parallel restore path with its
  own scroll-effect wiring** — cautionary tale C5 in
  [snapshot-restore-prior-art.md](./snapshot-restore-prior-art.md)
  documents a previous attempt at parallel phantom-seek that caused
  4 bugs and was reverted. Reuse the existing path.
- **Don't try `flushSync` or CSS tricks for the gate.** Cautionary
  tale C4: six different sub-frame-timing approaches were tried and
  failed (browser compositor paints between DOM mutation and
  scrollTop; CSS transforms compound the flash). The Zustand atomic
  `set()` approach is the only one that works.
- **Mount-time race between `kupuaKey` synthesis and TSR setup.** TSR
  runs its own router-mount logic and writes `__TSR_key` /
  `__TSR_index`. Synthesizing `kupuaKey` via `replaceState` must
  happen *after* TSR is settled. Test on cold loads, hot reloads,
  bfcache restores. The existing deep-link synthesis effect in
  `ImageDetail` is the established pattern.
- **`crypto.randomUUID` not available in test environment.** jsdom
  may not have it. Provide a polyfill in `kupua/src/test/setup.ts`
  (or wherever the unit-test setup lives) if needed.
- **sessionStorage quota on long-lived tabs.** Each snapshot is small
  (~200 bytes) and the LRU cap is 50 → ~10KB. Fine. But if the user
  has multiple kupua-using extensions / scripts also writing to
  sessionStorage, eviction is on us, not the browser. Test with the
  cap exceeded.
- **Anchor cursor extraction for sort fields not on every image.**
  `extractSortValues(image, orderBy)` works on standard fields but
  may return `null` for some custom orderings. If anchor cursor is
  null but offset is known, fall through to `seek(offset)`. Test
  this fallback explicitly.

## When to stop and ask

Per the directive: ask rather than spiral. Specifically:

- If TSR's `NavigateOptions['state']` rejects arbitrary fields and
  bypassing TSR for `replaceState` feels invasive.
- If the render gate (Phase 3) requires significant store / hook
  refactor beyond what's described here.
- If a regression in `phantom-focus.spec.ts` or
  `buffer-corruption.spec.ts` requires changing production behaviour
  in a way you're not sure the user wants.
- If you discover an additional history-touching site that needs
  snapshot capture but isn't in the audit table (the audit was
  thorough; this is unlikely).
- If bfcache verification (Phase 4) shows the in-memory Map
  *does not* survive bfcache restore — flag this as a finding before
  changing the design.

The user prefers being asked over the agent committing to a wrong
approach.

## Multi-session continuity

Each session begins with the **Fresh agent protocol**
(`.github/copilot-instructions.md`):

1. Greet with "Hi, I'm a fresh agent."
2. Read `kupua/exploration/docs/worklog-current.md`.
3. Read this handoff in full.
4. State current understanding; ask before writing code.

**Worklog discipline (per directive).** Maintain
`kupua/exploration/docs/worklog-current.md` during the session:
"Current Task" header (1–3 sentences) + "Session Log" (append-only,
~40 lines max of decisions, failures, findings). At commit / task
completion, move log content to `changelog.md` and reset
`worklog-current.md`.

**Phase boundaries are commit boundaries.** At end of each phase:
unit tests green, e2e green, suggest commit to user, wait for
approval. Never commit without explicit approval.

**Handoff to next agent.** Before signing off mid-session, update
the worklog with: current phase, what's done, what's blocked, and
what the next agent should pick up. Especially important when
context fills up — write the handoff *before* compaction kills your
context.
