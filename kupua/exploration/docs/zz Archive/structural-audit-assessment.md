# Kupua Structural Audit — Assessment & Gap Analysis

**Reviewer:** Staff Engineer
**Document reviewed:** `kupua-structural-audit.md` (v3, authoritative)
**Cross-referenced against:** `frontend-philosophy.md`, `tuning-knobs.md`, `migration-plan.md`, actual codebase (`kupua/src/`)
**Date:** 2 April 2026

---

## Overall Verdict

The audit is **sound**. The architecture, priorities, and phasing are correct. The three-layer separation model is the right framework. The DAL rehabilitation (Phase 2) is correctly identified as the most important phase. The throwaway harness (Phase 0) is well-scoped — it protects the refactoring without pretending to be a long-term test suite.

However, reading the structural audit against the team's own `frontend-philosophy.md` and `tuning-knobs.md` reveals **9 gaps** — things the audit doesn't address that will cause problems during or after the refactoring. Of these, **4 are medium-severity risks** that could bite you post-refactoring.

None of these require rethinking the plan. All are fixable with additions to the existing document.

---

## Gap 1: Multi-Select is Absent 🟠 MEDIUM

**Source:** `frontend-philosophy.md` §"Non-Negotiables" — *"Multi-select with batch metadata editing — the core editorial workflow."* Also §"Selection is Not Focus" — detailed design for selection surviving density changes, shift-click range, Cmd-click toggle, silent drop on search change.

**The problem:** The structural audit mentions multi-select only once, in passing (Part D risk table: "multi-select with bulk operations"). There is no store placeholder, no `selection-store.ts` in the Phase 2 split, no `SelectionSet` type, no mention in the Phase 4 directory structure.

**Why this matters:** Multi-select cuts across *every* component and *every* store:
- `ImageTable` and `ImageGrid` both need checkbox rendering and shift-click range selection.
- `ImageDetail` needs "part of selection" indicator.
- `ImageMetadata` needs multi-image diff display ("Multiple values — click ✎ to edit all").
- `buffer-store` needs to track which images in the buffer are selected.
- `focus-store` needs to keep selection orthogonal to focus (philosophy doc: "Selecting 5 images and then pressing ↓ to move focus shouldn't clear the selection").
- The `ActionBar` component (philosophy doc §"Actions are Written Once") needs `targetImages` derived from selection state.
- URL doesn't include selection (philosophy doc: "Selection is not in the URL"), so it's pure store state — but it must survive density changes, search changes (with silent drop), and even edit-state-in-progress.

**Recommendation:** Add a `stores/selection-store.ts` to the Phase 2 store split (Step 2.3). Define the `SelectionSet` type now — even if the store is empty, its existence forces the other stores to respect the boundary. Add `[future: selection-store.ts]` to the Phase 4 directory listing is not enough — the *interface* should be designed during Phase 2 because `buffer-store` and `focus-store` need to know about it.

---

## Gap 2: Tuning Constants Will Scatter 🟠 MEDIUM

**Source:** `tuning-knobs.md` — the entire document, especially the coupling map (§"Coupling Map — What Breaks What").

**The problem:** The structural audit splits the monolithic store into 6 files. The tuning constants documented in `tuning-knobs.md` are currently co-located in `search-store.ts` (lines 45–115): `BUFFER_CAPACITY`, `PAGE_SIZE`, `SCROLL_MODE_THRESHOLD`, `DEEP_SEEK_THRESHOLD`, `MAX_RESULT_WINDOW`, `AGG_DEBOUNCE_MS`, `AGG_CIRCUIT_BREAKER_MS`, `AGG_DEFAULT_SIZE`, `AGG_EXPANDED_SIZE`, `NEW_IMAGES_POLL_INTERVAL`.

After the Phase 2 split, these constants will scatter across `buffer-store.ts`, `aggregation-store.ts`, `ticker-store.ts`, `dal/enhanced-es-engine.ts`, etc. The coupling map in `tuning-knobs.md` — which is *the only document that shows how these constants interact* — will become stale. A developer changing `BUFFER_CAPACITY` in `buffer-store.ts` won't know it's coupled to `SCROLL_MODE_THRESHOLD` (which moved to a different file) without reading the tuning doc.

**Recommendation:** Create a single `constants/tuning.ts` file during Phase 2. All tuning knobs live here, with the coupling relationships expressed as comments or JSDoc. Individual stores import from this file. The tuning-knobs.md file references this single source of truth. The coupling visibility is preserved even as the stores split.

This is a 30-minute task that prevents hours of debugging when someone changes a constant without understanding its couplings.

---

## Gap 3: Store-to-Store Coordination Has No Specified Mechanism 🟠 MEDIUM

**Source:** The audit's own Phase 2, Step 2.3: *"Zustand slices communicate via `getState()` across stores — a documented Zustand pattern."*

**The problem:** This is true but insufficient. The current monolithic store has *synchronous update sequences* — e.g., a search triggers: `setParams` → `setLoading` → ES query → `setResults` → `setBufferOffset` → `setTotal` → `triggerAggregations` → `startNewImagesPoll`. In a single store, this is a sequential function. In 6 stores communicating via `getState()`, the sequence becomes:

1. `search-store.setParams()` → how does `buffer-store` know to start loading?
2. `buffer-store` receives results → how does `focus-store` know to resolve sort-around-focus?
3. `buffer-store` receives results → how does `aggregation-store` know to re-aggregate?
4. `focus-store` resolves focus → how does `buffer-store` know to adjust the buffer window?

The audit says "Zustand slices communicate via `getState()`" but `getState()` is for *reading*. The question is: who *calls* whom? Without explicit orchestration, developers will solve this ad hoc — some stores will subscribe to other stores' state changes (creating invisible reactive chains), others will call `getState()` + store methods imperatively (creating temporal coupling).

**Recommendation:** Add an explicit note to Phase 2 requiring **orchestration functions** — named functions in `lib/` (or co-located with the primary store) that coordinate multi-store sequences. For example:

```typescript
// lib/search-orchestration.ts
async function executeSearch(params: SearchParams) {
  searchStore.getState().setParams(params);
  const results = await bufferStore.getState().fetchInitialPage(params);
  focusStore.getState().resolveAfterSearch(results);
  aggregationStore.getState().triggerAggregations(params);
  tickerStore.getState().resetPoll(params);
}
```

This is *not* pub/sub (which would be worse — invisible reactive chains). It's explicit imperative coordination. The orchestration function is the one place that knows the sequence. Individual stores don't subscribe to each other.

---

## Gap 4: PIT Lifecycle Will Leak if Ownership Isn't Clarified 🟠 MEDIUM

**Source:** The audit's Phase 2, Step 2.2 (`enhanced-es-engine.ts`) and Step 2.3 (`buffer-store.ts`).

**The problem:** Currently, PIT (point-in-time) lifecycle is managed in the monolithic store: open PIT on search, reuse across extends, close on new search or eviction. The audit moves PIT-related code to `enhanced-es-engine.ts` (Layer 3). But `buffer-store.ts` (Layer 2) manages the buffer lifecycle — it knows when a search starts (open PIT), when extends happen (reuse PIT), and when the buffer is abandoned (close PIT).

If `buffer-store` holds the PIT ID and passes it to `enhanced-es-engine` methods, then Layer 2 is managing a Layer 3 concern (ES-specific pagination primitive). If `enhanced-es-engine` manages PIT internally, then `buffer-store` has no visibility into whether a PIT is open — and can't close it when the user navigates away.

**Recommendation:** `enhanced-es-engine.ts` should own PIT open/close internally. It exposes a `session` concept — `openSession()` returns a session handle, `extendForward(session, ...)` uses it, `closeSession(session)` releases resources. The session is opaque to `buffer-store` — it doesn't know whether the session uses PIT, cursors, or offset pagination. This aligns with the "future API shape" principle: a Grid API adapter's session might just be a no-op, or it might hold a server-side cursor token.

This needs to be specified in the audit because the wrong choice here (PIT ID leaking into Layer 2) would partially defeat the DAL rehabilitation.

---

## Gap 5: `sort-context.ts` (795 Lines) is Not Addressed 🟡 LOW

**Source:** Codebase — `src/lib/sort-context.ts` is 795 lines. The audit mentions it only in Finding 7 (test coverage table) as an untested file.

**The problem:** This file is larger than most components the audit targets for splitting. It defines sort field configurations, ES sort clause generation, sort display labels, and sort-around-focus algorithms. It contains both Layer 2 logic (sort display, sort-around-focus coordination) and Layer 3 logic (ES sort clause construction — `buildSortClause`, `parseSortField`).

**Why it's low severity:** The audit's Finding 1 already identifies `buildSortClause` and `parseSortField` as Layer 3 leaks. The Phase 2 DAL rehabilitation should naturally pull the ES-specific sort code into `enhanced-es-engine.ts`. But the audit doesn't explicitly call out `sort-context.ts` as a file to split, and a developer following the plan might miss it.

**Recommendation:** Add a note to Phase 2 that `sort-context.ts` should be split: ES sort clause builders → `dal/` (Layer 3), sort display/label logic → `lib/sort-context.ts` (Layer 2, now ~400 lines).

---

## Gap 6: `useReturnFromDetail.ts` and `useFullscreen.ts` Are Not Mentioned 🟡 LOW

**Source:** Codebase — `src/hooks/useReturnFromDetail.ts`, `src/hooks/useFullscreen.ts`.

**The problem:** These hooks exist in the codebase but are not mentioned anywhere in the audit. They're small, focused hooks — exactly what the audit is trying to create from the mega-hooks. If the refactoring introduces naming conventions or directory conventions that conflict with these existing well-structured hooks, it creates unnecessary churn.

**Recommendation:** Acknowledge existing well-structured hooks as examples of the target state. No action needed — just awareness.

---

## Gap 7: The Harness Doesn't Test Sort-Around-Focus 🟡 LOW

**Source:** The audit's Phase 0, Component 2 (State Transition Snapshots).

**The problem:** The harness tests "Sort change with focus" — but sort-around-focus is the single most complex state transition in the application. It involves: remember focused image ID → count documents before that image under the new sort → seek to that position → verify the focused image is near the viewport centre. This sequence crosses `focus-store`, `buffer-store`, and `enhanced-es-engine` (for `countBefore`).

The harness snapshot test records `sortAroundFocusStatus` transitions and `focusedImageId` preservation. But it doesn't verify the *position* — the image could be preserved in the store but rendered 5,000 rows away from where it was.

**Recommendation:** Add one assertion to the scroll-position smoke test (Component 4): after sorting by a different column, verify the focused image's DOM element is within the viewport (not just that `focusedImageId` is unchanged in the store). This is a 5-line addition to an existing test.

---

## Gap 8: No Mention of `column-store.ts` and `panel-store.ts` 🟡 LOW

**Source:** Codebase — `src/stores/column-store.ts`, `src/stores/panel-store.ts`.

**The problem:** These stores already exist as separate Zustand slices (column visibility/ordering and panel open/close state). The audit's Phase 2 (Step 2.3) lists 6 new stores to create from the monolithic `search-store.ts`, but doesn't mention these two existing stores. A developer reading the audit might think all state currently lives in `search-store.ts`, when in fact some separation has already been done.

**Recommendation:** Add a note acknowledging the existing store split. These stores are examples of the target pattern — they validate that the Zustand slice approach works.

---

## Gap 9: `image-offset-cache.ts` Fate Is Unclear 🟡 LOW

**Source:** Codebase — `src/lib/image-offset-cache.ts` (has tests). The audit doesn't mention this file.

**The problem:** This file caches image-to-offset mappings. After the Phase 2 split, this responsibility likely belongs to `buffer-store.ts` or `enhanced-es-engine.ts`. But it's not mentioned in any phase, so it will be left in `lib/` — orphaned from the module that uses it.

**Recommendation:** Decide during Phase 2 whether this cache belongs in the buffer store (Layer 2, if it caches buffer-local offsets) or the enhanced engine (Layer 3, if it caches global ES offsets). Move accordingly.

---

## Summary

| Gap | Severity | Fix effort | Phase to address |
|-----|----------|-----------|-----------------|
| 1. Multi-select store absent | 🟠 Medium | 2–4 hours (interface design) | Phase 2 |
| 2. Tuning constants scatter | 🟠 Medium | 30 minutes (create `constants/tuning.ts`) | Phase 2 |
| 3. Store-to-store coordination unspecified | 🟠 Medium | 1–2 hours (document orchestration pattern) | Phase 2 |
| 4. PIT lifecycle ownership ambiguous | 🟠 Medium | 1 hour (specify session abstraction) | Phase 2 |
| 5. `sort-context.ts` not addressed | 🟡 Low | Note in Phase 2 | Phase 2 |
| 6. Existing good hooks not acknowledged | 🟡 Low | Note only | N/A |
| 7. Harness misses sort-around-focus position | 🟡 Low | 5 lines in existing test | Phase 0 |
| 8. Existing stores not mentioned | 🟡 Low | Note only | Phase 2 |
| 9. `image-offset-cache.ts` orphaned | 🟡 Low | Decision during Phase 2 | Phase 2 |

**Total additional effort to close all 9 gaps: ~1 day**, mostly concentrated in Phase 2.

**Bottom line:** The structural audit is the right plan. These gaps are refinements, not corrections. Address the 4 medium-severity items before Phase 2 begins — they all affect the store split, which is the riskiest phase. The low-severity items can be addressed as they're encountered.

