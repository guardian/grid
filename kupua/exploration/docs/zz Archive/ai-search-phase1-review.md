# AI Search Phase 1 — Pre-Commit Review

**Scope:** uncommitted diff on `mk-next-next-next` (25 files, +1636/−302, plus 4 new files).
**Verdict:** ship it. The work is in good shape. Findings below are sorted by what I think matters; nothing is blocking, several things are worth fixing before commit, the rest are notes for later.

---

## Highlights

### What you got right that I want on the record

1. **Pivoting from CQL chip to a React widget was the correct call, and you made it at the right moment.** Three failure modes (browser-crashing observer loop, atomic-node caret problem, normalisation fragility) are each independently sufficient to reject the chip approach. Recognising "this isn't a bug, it's the wrong shape" after sinking real time into making it work is the hard skill. The new `AiSearchInput` is also genuinely nicer UX — content-aware width, stash/restore, escape-to-collapse, blur-to-collapse-when-empty.

2. **Promoting `aiQuery` to a top-level URL param (the +58/−166 refactor) was the second correct pivot.** The fact that one concept had to be regex-parsed out of another in five separate places was the smell; the fix is structural. The diff is net-negative which is the cleanest signal you can get that the original shape was wrong. The breadcrumb to the `SearchContext` future doc through [src/lib/ai-search-params.ts](kupua/src/lib/ai-search-params.ts#L1-L3) lands exactly where the next architecture-touching person will read it.

3. **"AI is not a mode" held up under pressure.** No `_isAiMode` flag, no parallel code path in tickers/filters/counts. The decorator pattern at three call sites is the entire mode-handling cost. The store's AI branch is ~100 lines of explicit cursor/PIT/poll suppression — visible, contained, easy to delete when SearchContext lands.

4. **Graceful-absence discipline is intact.** [`checkBedrockHealth`](kupua/src/lib/bedrock-proxy-client.ts#L29-L38) never throws, [`bedrockEmbedProxy`](kupua/scripts/bedrock-embed-proxy.mjs#L98-L117) returns `{available:false}` on probe failure with one info log and no spam, `AiSearchInput` renders `null` when unavailable. The whole feature stays out of the way in local/Docker setups.

5. **The Home → type latent bug was real and the diagnosis is correct.** `cancelSearchDebounce("")` setting `_externalQuery = ""` as a permanent latch is exactly the kind of bug that survives for months until React rerender timing shifts. The fix (no-arg, latch=`null`) is right; the worklog note about *why* it surfaced now (AI param changed batching) is the bit I'd want flagged in a commit message.

---

## Things worth fixing before commit

### F1 — `cancelSearchDebounce(text)` in `handleClear` was deliberately changed; AI debounce is cleared separately. Confirm intent.

[`SearchBar.tsx:124-128`](kupua/src/components/SearchBar.tsx#L124-L128) currently calls `cancelSearchDebounce()` (no arg) then manually cancels `aiDebounceRef`. That's correct given F1's fix. But the comment on `cancelSearchDebounce` no longer says "pass the new text to set the latch" — make sure the helper's JSDoc was updated, otherwise the next agent re-introduces the bug.

**Action:** read `cancelSearchDebounce` JSDoc; if it still mentions the "" pattern, update it to say "no-arg clears the latch; arg-form is for in-flight typing transitions only."

### F2 — Sort dropdown shows "Relevance" only when `params.aiQuery` is set, but the URL→store sync writes `_preSortBeforeAi` only on the `useUpdateSearchParams` path.

[`useUrlSearchSync.ts:426-442`](kupua/src/hooks/useUrlSearchSync.ts#L426-L442) auto-swaps sort to `-relevance` *only* when the user changes `aiQuery` via `updateSearch()`. But [`useUrlSearchSync.ts:343-344`](kupua/src/hooks/useUrlSearchSync.ts#L343-L344) re-sorts the buffer on any sort-only URL change with `aiQuery` set — including landing on a deep-linked URL like `?aiQuery=tigers&orderBy=-uploadTime`.

**Question to test:** if a user pastes a URL with `aiQuery` set but `orderBy=-uploadTime` (or no `orderBy`), what happens? The dropdown shows "Relevance" as the default (per [`SearchFilters.tsx:99`](kupua/src/components/SearchFilters.tsx#L99)) but the data is sorted by uploadTime. Cosmetic but confusing. The sort-only short-circuit also won't fire on first load (it's gated on `isSortOnly`).

**Action:** either (a) accept the inconsistency and document it, or (b) on initial load with `aiQuery && orderBy !== "-relevance"`, force a `resortAiBuffer` after the AI fetch lands. I'd pick (a) — deep-link with explicit sort is rare and the user clearly opted into a non-default order.

### F3 — `getEmbedding` cache key is `text.trim().toLowerCase()` server-side; browser-side passes raw `aiText`.

[`bedrock-embed-proxy.mjs:88`](kupua/scripts/bedrock-embed-proxy.mjs#L88) normalises before cache lookup. Fine. But there's no equivalent dedup on the browser side — if `AiSearchInput` debounces a keystroke at 600ms and the user is mid-typing, you can fire several `/bedrock/embed?q=...` calls with substrings of the final query. Each one round-trips. Server-side LRU helps only on exact-match repeats.

**Action:** none required (network cost is tiny, Bedrock charges per token), but worth noting in the changelog as a known characteristic. If it bites later, add `AbortController` cancellation to `searchByAi` so the previous embed fetch dies when a new one starts. The store already aborts old ES requests via `signal`, but `getEmbedding` doesn't accept one.

### F4 — `searchByAi` ignores the `signal` parameter for the embed call.

[`es-adapter.ts:1125`](kupua/src/dal/es-adapter.ts#L1125): `await getEmbedding(aiText)`. The `signal` is wired through to `esRequest` for the KNN call, but the Bedrock embed call (the slower of the two by a wide margin) runs uncancelled. If the user types fast and a new search fires, the old embed call still completes and is wasted.

**Action:** thread `signal` through `getEmbedding` → `fetch("/bedrock/embed", { signal })`. Server-side, the AWS SDK call is harder to cancel mid-flight, but at minimum the browser stops waiting and the result is discarded. ~5 LOC.

### F5 — `__aiScore ?? 0` in `resortAiBuffer` silently sorts non-AI results to the bottom of a descending sort.

[`search-store.ts:3794-3795`](kupua/src/stores/search-store.ts#L3794-L3795). Probably impossible to hit in practice (the resort only fires when `aiQuery` is set, all results have `__aiScore`), but the defensive `?? 0` masks a bug if it ever happens. Prefer: assert presence, or sort missing-last explicitly.

**Action:** low priority — leave the `?? 0` and add `// invariant: all results have __aiScore when resort is called from AI mode` if you want. Don't over-engineer.

### F6 — `AiSearchInput` `_stashedAiText` is module-level singleton state.

[`AiSearchInput.tsx:19`](kupua/src/components/AiSearchInput.tsx#L19). If two `AiSearchInput` instances ever co-exist (split-view, multi-tab-shared-process trick, future "compare two searches" feature) they will trample each other. Today there's exactly one search bar; tomorrow this is a latent bug.

**Action:** none right now. Note it in deviations.md or as a `// TODO when split-view lands` comment if you want a breadcrumb. The `_stashedAiText` mount-effect reset (line 40-41) already handles the most common gotcha (Home reset).

---

## Architectural notes (not actions)

### N1 — The decorator + SearchContext pairing is exactly the shape I'd want.

Decorator at three call sites with a one-line breadcrumb comment to the future doc; SearchContext doc sits in backlog waiting for Phase 3. The cost of the decorator is ~25 LOC across two files. The cost of SearchContext-now would have been ~200-300 LOC + test surface migration designed from one data point. You picked correctly. The thing that will go wrong: someone adds Phase 3 in six months, doesn't read the breadcrumb, adds a fourth regex to the decorator and ships. Mitigation: AGENTS.md backlog entry is the gate. (I added it.)

### N2 — `__aiScore` lives on the `Image` interface as an optional field.

[`types/image.ts:203-206`](kupua/src/types/image.ts#L203-L206). This is fine pragmatically — it travels with the hit through the store without a parallel data structure — but it muddies the type. `Image` is now "data from ES + kupua-internal hint maybe." An alternative is `Map<imageId, number>` in the store, but that means an indirection on every render of relevance-sorted results. Stick with what you have; if SearchContext lands and a second algorithm appears, that's the moment to extract a `RankingMetadata` field.

### N3 — Synthetic sort values `[k - i, img.id]` in `searchByAi`.

[`es-adapter.ts:1170`](kupua/src/dal/es-adapter.ts#L1170). The worklog calls these out as "never used for pagination" — true today. They're used by `imagePositions` and the cursor API just enough to not crash. Two risks:

- If anything ever calls `countBefore(aiResult.sortValues[i])` against ES, it will fail catastrophically (these aren't real ES cursors). The `total === hits.length` invariant is the only thing preventing it.
- If the buffer architecture ever stops trusting `total` as the gate (e.g. Phase 2 hybrid search returns a re-runnable query *and* a buffer cap), the synthetic cursors leak into real ES calls and produce zero results silently.

This is exactly what SearchContext (`{ kind: "id-set", ids }`) prevents at the type level. Recording the risk; not requesting action.

### N4 — `__aiRank` was discussed in worklog as a fix for Back-navigation but isn't in the code.

Earlier worklog entry from 2026-05-24 ("PRE-1c BLOCKER — browser back-navigation breaks position") proposes `__aiRank` (0-based index for direct scroll-to-index restore). The implemented fix uses `focusedInAiResults` + `sortAroundFocusGeneration` instead, which is simpler. Worth confirming the back-restore actually works in manual testing of every variant: (a) AI → click image → back, (b) AI → sort to uploadTime → back, (c) AI → remove chip → back, (d) AI → page reload → forward. The phantom/`_phantomPulseImageId` wiring in the AI branch suggests you've thought about it, but the test surface in [`search-store.test.ts:1894`](kupua/src/stores/search-store.test.ts#L1894) only covers one of the four.

### N5 — `aiQuery` typeahead is naturally absent.

Typeahead doesn't know about `aiQuery` because it's not in `query`. Consistent with the SearchContext doc's "typeahead is world-scoped" principle — and got it for free. No action.

### N6 — `bedrockAvailable` subscriber pattern is a mild smell, not a problem.

[`grid-config.ts:223-237`](kupua/src/lib/grid-config.ts#L223-L237) — `export let` + `Set<fn>` + `subscribeBedrockAvailable` is a one-off mini-store. Could have been a Zustand slice for consistency with the rest of the app, but the overhead for a single boolean isn't worth it. Leave it.

---

## Test coverage check

- Unit: 875/875 → 868/868 across the refactor. Net −7 because `extractAiQuery` tests deleted. Coverage of `searchByAi`, `decorateParamsForAggregations`, AI store branch, and `resortAiBuffer` all present. ✓
- Playwright: explicitly deferred per worklog. The Phase 1c workplan called for 15-min research step; that hasn't happened yet. **Don't commit Phase 1 without at least a smoke spec** — see directive table requiring e2e after any component/hook/store change. AI search touches all three.
- Manual coverage to perform before commit (5 min):
  1. Type AI query, see ≤200 results, "Relevance" appears in sort, dot suppressed.
  2. Switch sort to uploadTime → no ES call, results re-ordered in place.
  3. Click image → back → image is focused.
  4. Toggle sparkles off → on → text is restored.
  5. Hard refresh on `?aiQuery=tigers` → results land, sort defaults to relevance.
  6. Set `bedrockAvailable=false` (e.g. revoke creds) → AI widget disappears, no errors in console.

---

## Commit suggestion

This is two clean commits, not one:

1. **`feat(kupua): AI image search via Bedrock + KNN (Phase 1)`** — everything except the Home-typing fix.
2. **`fix(kupua): clear _externalQuery latch on Home reset`** — the latent bug, with its own commit message explaining why it surfaced now. Easier to revert in isolation if it has fallout.

Both should reference `ai-search-workplan.md` and `ai-search-aggregation-problem.md`.
