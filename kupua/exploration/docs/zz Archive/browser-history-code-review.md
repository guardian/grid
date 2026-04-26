# Browser History — Code Review

**Reviewer:** fresh agent (Claude Opus 4.7)
**Date:** 26 April 2026
**Scope:** All uncommitted browser-history work (Phases 1–4 + flag retirement
+ baseline + debounced-typing fix). New files, modified files, tests, doc.
**Method:** Read every changed `kupua/src/**` file, all new tests, the
architecture doc, the changelog entries, the prior-art/known-bugs/phantom-
drift notes. Cross-referenced doc claims against actual code.

**Bottom line:** The work is **well-structured and ships**. Architecture is
sound; the kupuaKey + snapshot abstraction is clean; tests cover the major
flows. Two correctness bugs worth fixing before commit (one I'd consider
high, one medium). Several "claimed but unwired" gaps where doc/changelog
overstates what code does. Phantom drift remains an open known limitation
and should be moved out of the way as you've already planned.

---

## Verdict by area

| Area | Verdict |
|---|---|
| `kupuaKey` infrastructure ([history-key.ts](kupua/src/lib/orchestration/history-key.ts)) | ✅ Solid |
| Snapshot store ([history-snapshot.ts](kupua/src/lib/history-snapshot.ts)) | ✅ Solid |
| Snapshot builder ([build-history-snapshot.ts](kupua/src/lib/build-history-snapshot.ts)) | ✅ Mostly |
| Capture wiring ([orchestration/search.ts](kupua/src/lib/orchestration/search.ts), [main.tsx](kupua/src/main.tsx)) | ✅ Solid |
| Restore path ([useUrlSearchSync.ts](kupua/src/hooks/useUrlSearchSync.ts)) | ⚠️ Two bugs |
| Render-gate reuse via `snapshotHints` ([search-store.ts](kupua/src/stores/search-store.ts)) | ⚠️ Plumbed but underused |
| Column alignment ([search-store.ts](kupua/src/stores/search-store.ts) `_loadBufferAroundImage`) | ✅ Clean |
| Scroll-teleport guard ([useScrollEffects.ts](kupua/src/hooks/useScrollEffects.ts)) | ✅ Clever, well-commented |
| `buildSearchKey` exclusions ([image-offset-cache.ts](kupua/src/lib/image-offset-cache.ts)) | ✅ Correct fix |
| Tests | ✅ Strong; 1 gap |
| Architecture doc ([04-browser-history-architecture.md](kupua/exploration/docs/00%20Architecture%20and%20philosophy/04-browser-history-architecture.md)) | ⚠️ Two doc/code mismatches |

---

## High-severity findings

### H1. `withCurrentKupuaKey()` drops `_bareListSynthesized` flag on every traversal replace

**Where:** [`history-key.ts`](kupua/src/lib/orchestration/history-key.ts#L53-L62) +
[`ImageDetail.tsx:283`](kupua/src/components/ImageDetail.tsx#L283).

**The flow:**

1. Cold-load an image URL (or open detail). `ImageDetail` synthesises a bare-list
   entry below and stamps the **detail entry** with
   `{ ...detailState, _bareListSynthesized: true }` via raw `pushState` ([L152](kupua/src/components/ImageDetail.tsx#L152)).
2. User presses next/prev to traverse to image B. `useImageTraversal.onNavigate`
   calls `navigate({ replace: true, state: withCurrentKupuaKey() })` ([L283](kupua/src/components/ImageDetail.tsx#L283)).
3. `withCurrentKupuaKey()` returns `{ kupuaKey }` only — it does **not**
   merge with the existing `history.state`. The `_bareListSynthesized`
   flag is now gone from this entry.
4. User closes detail (`history.back()` → bare-list entry). User presses
   forward → re-mounts `ImageDetail`. Synthesis check on [L136](kupua/src/components/ImageDetail.tsx#L136)
   sees `!history.state?._bareListSynthesized` → **re-synthesises**, inserting
   a phantom bare-list entry and **truncating any forward history above it**.

**Why the helper is wrong:**
```ts
// history-key.ts L53
export function withCurrentKupuaKey(extraState?: Record<string, unknown>) {
  const kupuaKey = getCurrentKupuaKey();
  if (kupuaKey === undefined) return extraState ?? {};
  return { ...extraState, kupuaKey };  // ← only kupuaKey + extraState; existing state lost
}
```

The function reads only the kupuaKey from `history.state`, not the rest.
Anything stamped on `history.state` outside the kupuaKey field is dropped
on the next replace that goes through this helper.

**Fix options:**
- (A) Make `withCurrentKupuaKey` preserve the entire current `history.state`:
  `return { ...history.state, ...extraState, kupuaKey };` (kupuaKey wins).
- (B) Stamp `_bareListSynthesized` somewhere outside `history.state` (a
  module-level Set keyed by kupuaKey). Adds bookkeeping; not preferred.
- (C) Have `useImageTraversal.onNavigate` re-stamp the flag explicitly.
  Spreads the responsibility; not preferred.

I'd go with **(A)**. It's the principle of least surprise — a "with"
helper should be additive, not destructive. There's a related risk:
TSR's own `__TSR_key`/`__TSR_index` may also be in `history.state` and
could be clobbered today; option (A) protects them too.

**Test gap:** No e2e covers "open detail → traverse to image B → close
→ forward re-opens detail (no truncation, no extra entry)". Worth adding.

---

### H2. `scrollTopFallback` uses `window.scrollTo`, but kupua scrolls inside a custom container

**Where:** [`useUrlSearchSync.ts:L260-L267`](kupua/src/hooks/useUrlSearchSync.ts#L260-L267).

```ts
if (scrollTopFallback !== null) {
  const targetScrollTop = scrollTopFallback;
  const unsub = useSearchStore.subscribe((state) => {
    if (!state.loading) {
      unsub();
      requestAnimationFrame(() => window.scrollTo(0, targetScrollTop));  // ← wrong target
    }
  });
}
```

The capture side reads from the custom scroll container:
```ts
// build-history-snapshot.ts L40
const scrollTop = scrollContainer?.scrollTop ?? 0;
```

But the restore writes to `window`. These are two different elements.
The custom container has its own scroll position; `window.scrollTo`
moves the document, not the container.

**Fix:**
```ts
const container = getScrollContainer();
container?.scrollTo({ top: targetScrollTop });
```

**Severity rationale:** This path is rare (snapshot with no anchor — empty
results at capture time). Still, it's currently broken silently. No e2e
covers it, which is why it slipped through.

**Test gap:** Add an e2e that captures a snapshot with no results
(filter that produces zero hits, scroll the empty page), navigates
away, then back, asserts the (zero) scroll position restores. Or just
delete the fallback if you decide it's not worth fixing — the empty-
results case has nowhere meaningful to restore *to*.

---

## Medium-severity findings

### M1. `anchorCursor` is captured, plumbed end-to-end, then discarded

**Where:** Snapshot field `anchorCursor` ([history-snapshot.ts:L26](kupua/src/lib/history-snapshot.ts#L26))
is built ([build-history-snapshot.ts:L72](kupua/src/lib/build-history-snapshot.ts#L72)),
threaded into `snapshotHints` in [useUrlSearchSync.ts:L207](kupua/src/hooks/useUrlSearchSync.ts#L207),
declared in `search()`'s options type ([search-store.ts:L361](kupua/src/stores/search-store.ts#L361)),
and… **never read**. Only `snapshotHints.anchorOffset` reaches a consumer
([search-store.ts:L1798](kupua/src/stores/search-store.ts#L1798) — passed
as `hintOffset` to `_findAndFocusImage`).

**Why this matters:**
- The architecture doc claims cursor-based restore (§ "Restore" item 3:
  "passes the snapshot's anchorImageId as sortAroundFocusId to search()
  with `snapshotHints: { anchorCursor, anchorOffset }`. This engages the
  existing sort-around-focus render gate"). The cursor is in the type
  signature but doesn't influence behaviour.
- The prior-art doc (`snapshot-restore-prior-art.md` §1) explicitly
  recommends using `restoreAroundCursor(imageId, cursor, cachedOffset)`
  as the primary restore primitive. We chose `sortAroundFocusId` instead
  — fine — but then we kept the cursor in the data path "for symmetry"
  without using it.

**Decisions needed:**
- (A) Wire it: change `_findAndFocusImage` to accept `hintCursor` and
  short-circuit Step 1 (the `searchAfter(ids: imageId, length: 1)` ES
  round-trip used to fetch sort values). Saves one ES request per
  popstate restore. Modest win.
- (B) Delete it: drop `anchorCursor` from `HistorySnapshot`,
  `snapshotHints`, and `buildHistorySnapshot`. Smaller surface area,
  smaller sessionStorage footprint, less doc lying.

I'd lean **(B)** unless the saved round-trip matters at scale. The Step 1
request is tiny (length=1, ids=single ID), and we already have to do
Step 2 (countBefore/position-map lookup) which dominates wall time.

### M2. `hintOffset` only helps in deep-seek mode (>65k results)

**Where:** [`search-store.ts:L1361`](kupua/src/stores/search-store.ts#L1361).

```ts
} else {
  // No position map → >65k results (deep-seek mode).
  offset = hintOffset ?? 0;  // ← only path that uses hintOffset
  ...
}
```

For result sets ≤65k (which is most of the app), the position map
provides the offset and `hintOffset` is ignored. Not a bug — the
position map is faster — but worth noting that the snapshot's
`anchorOffset` only short-circuits the slow path. Combined with M1
(cursor is unwired), the snapshot's "hint" infrastructure is
mostly cosmetic for the common case. The render gate works correctly
either way; just don't oversell the hint plumbing.

### M3. Doc claims "isMount" branch with "strict-only on mount". No such branch exists

**Where:** [Architecture doc § "Mount-time restore (reload)"](kupua/exploration/docs/00%20Architecture%20and%20philosophy/04-browser-history-architecture.md):

> The same restore path fires, but with strict-only searchKey matching.

**What the code does:** The popstate path fires on mount because
`consumeUserInitiatedFlag()` returns `false` on a fresh load. The lenient
flag was deleted entirely (correctly — analysis showed it was dead
code). So "strict-only on mount" is technically true, but only because
strict-only is *the only mode that exists anywhere*. The doc reads as
if there were two modes; there's one.

**Fix:** Remove the "but with strict-only" qualifier from the arch doc.
The mount-time restore fires the same code as popstate, full stop.

### M4. `useUpdateSearchParams` push branch captures a snapshot even when the navigate is a no-op

**Where:** [`useUrlSearchSync.ts:L294-L312`](kupua/src/hooks/useUrlSearchSync.ts#L294-L312).

```ts
return useCallback((updates, options) => {
  const isReplace = options?.replace ?? false;
  if (!isReplace) {
    markPushSnapshot();  // captures unconditionally
  }
  markUserInitiatedNavigation();
  ...
  navigate({ ..., replace: isReplace, state });
});
```

If a caller passes `updates` that match the current params (e.g. clicking
the same filter twice), TSR may dedupe the navigate but we've already
captured a snapshot for the predecessor. Wasted work; the snapshot will
sit in storage until LRU'd. Same applies if multiple components fire
"set the same param" in quick succession.

**Severity:** very low — the snapshot is small, LRU'd, and the wasted
DOM `querySelector` for `viewportRatio` is cheap. Worth knowing if
profiling ever flags it. Not worth fixing speculatively.

### M5. Captured snapshots for "open image detail" are never useful

**Where:** [`pushNavigate`](kupua/src/lib/orchestration/search.ts#L342-L350)
unconditionally calls `markPushSnapshot()`. `pushNavigate` is used by
ImageGrid/ImageTable to enter detail (display-only `image=` key change).

The snapshot captured here describes "the search context just before
opening detail" and is keyed by the search-context entry's kupuaKey.
On back-from-detail, the dedup guard in `useUrlSearchSync` bails
before the popstate restore branch runs (display-only key change), so
this snapshot is **never read**. Same applies to forward-back-forward
across the detail entry.

**Severity:** low — wasted snapshot, capped by LRU. But it points at a
design clarity thing: `markPushSnapshot()` is currently called from
every push site whether or not the resulting entry would benefit from
restore. Could short-circuit by checking "is the new URL display-only
relative to current?" before capturing. Probably not worth the
complexity.

---

## Low-severity / nits

### L1. `_lastKupuaKey` is module-level — fine, but undocumented invariant

[`useUrlSearchSync.ts:L34`](kupua/src/hooks/useUrlSearchSync.ts#L34). The
comment explains *why* (popstate timing) but not the invariant: this
variable is "the kupuaKey we last successfully processed in the effect".
On the very first popstate after cold load, `_lastKupuaKey` is
`undefined` (not yet assigned), so the departure-capture is skipped —
which is correct (no predecessor to capture for) but accidental.
Worth a one-line comment that this is intentional.

### L2. Departure-capture fires for ALL `!isUserInitiated` cases, not just popstate

[`useUrlSearchSync.ts:L181`](kupua/src/hooks/useUrlSearchSync.ts#L181). The
variable is named `isPopstate` but the discriminator is "did anyone call
`markUserInitiatedNavigation` recently". Any future programmatic
navigation that forgets to mark itself will be treated as popstate and
trigger a departure capture — capturing a snapshot for an entry the user
isn't actually leaving. Today there are no such sites (per the audit
table), but this is fragile to future additions. Consider renaming the
local variable to `isProbablyPopstate` or asserting via test that all
known navigation paths mark.

### L3. `synthesiseKupuaKeyIfAbsent` uses raw `replaceState(state, "")` — empty URL

[`history-key.ts:L100`](kupua/src/lib/orchestration/history-key.ts#L100).
Per HTML spec, `""` means "current URL", so this is correct. But it
reads as ambiguous; a reader unfamiliar with the spec might wonder if
this clobbers the URL. A one-line comment ("empty URL = keep current")
would help.

### L4. `SessionStorageSnapshotStore` constructor scans all keys on every instantiation

[`history-snapshot.ts:L122-L131`](kupua/src/lib/history-snapshot.ts#L122-L131).
Module-level singleton, so instantiated once per page load — fine. But if
anyone ever writes a test that constructs many instances, the cost adds
up. Not worth changing today; just know it's there.

### L5. `getCurrentKupuaKey` cast

[`history-key.ts:L39`](kupua/src/lib/orchestration/history-key.ts#L39).
The eslint-disable-next-line is fine. Could use `unknown` and a type
guard for slightly more rigor; current code is pragmatic.

### L6. Pagehide handler doesn't check `event.persisted`

[`main.tsx:L26-L31`](kupua/src/main.tsx#L26-L31). Captures unconditionally
on `pagehide`, which fires for both unload AND bfcache freezes. That's
the intended behaviour (snapshot needs to be ready for either path), so
this is correct — but `event.persisted` distinguishes the two and could
be useful for diagnostics or for skipping the sessionStorage write when
bfcache freeze keeps the in-memory Map alive. Skip unless profiling
flags it.

### L7. `trim` calculation in `_loadBufferAroundImage` could be a one-liner with named vars

[`search-store.ts:L1106-L1110`](kupua/src/stores/search-store.ts#L1106-L1110)
is correct but reads slightly busy. A `targetColumn = exactOffset % cols`
variable would make the intent immediate. Minor.

---

## Test coverage assessment

**Strong:**
- 32 e2e tests in `browser-history.spec.ts`, well-grouped by describe block.
- Unit coverage for `history-key.ts` (5 sub-suites, every helper).
- Unit coverage for both snapshot store impls including LRU eviction
  and corrupt-JSON handling.
- Unit coverage for `buildHistorySnapshot` anchor selection across both
  focus modes.
- Reload survival tested across 4 scenarios (basic, reload-then-back,
  deep, bfcache).
- Scroll-teleport regression test included with the fix that prompted it.
- Pre-existing bug fix (re-synthesis on popstate-back-to-detail) is
  covered by tests #350 ("SPA open-close cycle does not accumulate
  phantom history entries") and #305 ("Backspace close then forward
  re-opens detail").

**Gaps worth filling:**
1. **Traversal + close + forward** — the H1 bug. No test covers
   "open detail → traverse to image B → close → forward should re-open
   image B (no phantom entry, no truncation)". This would catch H1.
2. **scrollTop fallback path** (H2) — no test covers the empty-results
   capture/restore. Either fix the bug and add a test, or delete the
   fallback.
3. **Phantom-anchor stability across N back/forward cycles** — already
   noted as needed in `phantom-drift-investigation.md` § 1. Not a
   review blocker but a known gap.

**Minor test concerns:**
- `kupuaKey survives replace` test (L670) hand-wires `state: { kupuaKey: ... }`
  rather than going through `withCurrentKupuaKey()`. Tests the mechanism
  but not the abstraction. Adding a second variant that uses the helper
  would catch H1.
- `spaNavigate` mirrors `pushNavigate`'s three steps manually. Now that
  `pushNavigate` exists in production, consider having `spaNavigate` call
  `__kupua_pushNavigate__` (a new dev-global) — single source of truth.

---

## Architecture doc accuracy check

The arch doc is **mostly accurate** and well-organised. The component
table, file map, philosophy section, and history entry rules table all
match the code. Specific deltas to fix:

| Doc claim | Reality |
|---|---|
| "Mount-time restore: same path, **strict-only matching**" | Lenient was deleted; only mode is strict. Drop the qualifier. |
| `snapshotHints: { anchorCursor, anchorOffset }` engages render gate | Only `anchorOffset` is consumed; `anchorCursor` is dead. (M1) |
| 35 e2e tests "across four describe blocks" | Counted 32 in the spec file. Likely includes some baseline tests not yet here, or count drift. Verify and update. |
| Restore preference §3: "Pass `anchorImageId` as `sortAroundFocusId`" | ✅ Matches. |
| `_loadBufferAroundImage` column alignment | ✅ Matches code. |
| `scrollAppliedResultsRef` fix | ✅ Matches code. |
| Known limitation: phantom drift | ✅ Matches `phantom-drift-investigation.md`. |

Also: the arch doc's **Pre-existing bugs found** section (Bug 1, scrubber
thumb staleness on sort) is now in `preexisting-bugs-found-during-history-work.md`
with a Phase 4 insight that likely-one-liner fix exists. Worth promoting
to a fix in this work, but understandable to defer.

---

## Things done particularly well

Worth calling out — these are good patterns to reuse:

1. **`scrollAppliedResultsRef` discriminator** ([useScrollEffects.ts:L681-L774](kupua/src/hooks/useScrollEffects.ts#L681)).
   The "results-array-identity" trick to distinguish offset correction
   (allowed re-fire) from buffer extends (blocked re-fire) is precise and
   well-commented. Beats the generation guard that was tried first.

2. **`buildSearchKey` exclusions** ([image-offset-cache.ts:L33-L40](kupua/src/lib/image-offset-cache.ts#L33-L40)).
   Adding `offset`/`length`/`countAll` to the strip list — and pinning
   the test (the two new test cases prove the fix) — surfaced the Phase
   4 mount-time mismatch bug. Good defensive change.

3. **Capture-on-pagehide pattern**. Symmetric with capture-on-push. The
   only entry that lacks a "natural" capture point gets one. Clean.

4. **Snapshot keyed by predecessor, not new entry**. Counterintuitive at
   first read but it's the only ordering that lets the new entry's
   `searchKey` participate in strict matching on later popstate. Doc
   explains it well.

5. **Three flags reduced to one**. `EXPERIMENTAL_*` discipline worked:
   they got dogfooded, decided, and deleted. Only the permanent
   `PERSIST_HISTORY_SNAPSHOTS_FOR_RELOAD` survives.

6. **Test fixtures and helpers** in the e2e file are consistent and
   reused (`spaNavigate`, `getKupuaKey`, `getUrlQuery`, `waitForSearchSettled`).

---

## Recommendations, in priority order

1. **Fix H1** (`withCurrentKupuaKey` preserves entire `history.state`) and
   **add the traversal-close-forward test**. ~15 min change, prevents
   real user-visible truncation.
2. **Decide M1** (wire `anchorCursor` or delete it). Either is fine;
   choosing one removes the doc/code gap. Lean delete.
3. **Fix or delete H2** (`scrollTopFallback` target). Trivial fix; or
   delete the path if "restore to scroll position with no anchor" isn't
   worth supporting.
4. **Update arch doc M3** (drop the "strict-only on mount" framing).
5. **Update arch doc test count** from 35 → actual count post-fixes.
6. **Pre-existing Bug 1** (scrubber thumb stale on sort). One-line fix
   per the Phase 4 insight; probably worth doing in this work or
   immediately after.
7. **Phantom drift** stays open as documented. The `phantom-drift-
   investigation.md` doc is the right shape for picking it up later.

None of these block commit. H1 and H2 are real bugs but neither
catastrophic — H1 needs a specific user sequence (traverse + close +
forward) that's plausible but not the dominant flow; H2 affects only
the empty-results edge case.

---

## What I did NOT review in depth

- The 532-line e2e diff was scanned for shape and key assertions, not
  every test body. Confidence is from sampling. If any single new test
  has logical gaps, I'd find them on a follow-up pass.
- The perf-log JSON/MD changes (auto-generated) — assumed to be regen
  output, not human-edited.
- The `image-embedder-lambda` and other top-level dirs — out of scope.
- The `worklog-current.md` — not a code artifact.
- Did not run the test suite myself; trusting the changelog's
  "392 unit, 182 e2e, 0 failures" claim.
