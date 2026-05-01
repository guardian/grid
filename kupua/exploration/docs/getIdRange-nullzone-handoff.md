# Handoff: `getIdRange` null-zone correctness

> **Status:** unstarted. Created 1 May 2026 during S1 sense-check.
> **Recommended model:** Sonnet 4.6 High (real bugs needing context + judgement
> across 6 call sites and one cross-cutting refactor decision).
> **Estimated:** 1 investigation session + 1 fix session, OR 1 combined session
> if the investigation collapses on a clear answer fast.

---

## Mission

Make `ElasticsearchDataSource.getIdRange` (in [`kupua/src/dal/es-adapter.ts`](../../src/dal/es-adapter.ts), defined around line 1526) correct against null-zone sorts (sorts whose primary field is sparsely populated, e.g. `taken`, `lastModified`). Today it works for `uploadTime` (universally populated) and silently under-counts for any other primary sort.

Selections (Phase S3a, not yet started) is the consumer that will trigger this. We are doing the fix in a dedicated session because the right fix is cross-cutting: search-store has six call sites of the same null-zone pattern that the fix should ideally consolidate.

---

## Push-back clause (read first)

If, while reading the code, you conclude any of the following:

- The bugs as described below are not real on close reading
- The "two-phase walk" pattern in search-store doesn't actually solve the same problem `getIdRange` would face
- The right fix is materially different from what this handoff anticipates
- The investigation reveals the existing search-store code is itself broken in ways this handoff understates

**STOP**, write a "Section 0 — premise check" findings note, and ask the user before proceeding to code. The user explicitly prefers a clarifying question over a wrong fix.

---

## Background — what's in place today

The kupua codebase has fought null-zone bugs three times (3 April, 14 April, 26 April 2026 changelog entries). The current production-tested pattern lives in `search-store.ts` and consists of three primitives:

1. **`sanitizeSortValues(sv)`** — `es-adapter.ts:59`. Replaces ES `Long.MAX_VALUE` / `Long.MIN_VALUE` sentinels (any number with `Math.abs(v) >= 9.2e18`) with `null`. Already called at `es-adapter.ts:372`, `:612`, `:654`, `:1573` (the last one is inside `getIdRange` itself, on emitted hit values — partial coverage).

2. **`detectNullZoneCursor(cursor, orderBy)`** — `search-store.ts:779`. If the primary field's position in the cursor is null, returns `{ strippedCursor, sortOverride, extraFilter, primaryField, sortClause }` describing how to do a phase-2 walk that includes only docs where the primary field is missing, sorted by the fallback (uploadTime + id).

3. **`remapNullZoneSortValues(svs, sortClause, primaryField)`** — `search-store.ts:838`. Pads phase-2 sort values back to the full sort clause shape (inserts `null` at the primary's position) so that downstream cursor handling is shape-correct.

The walk pattern (search-store.ts:906, :1078, :2072, :2219, :2488, :3151 — six instances) is roughly:
```
nz = detectNullZoneCursor(cursor, orderBy)
result = dataSource.searchAfter(
  params, nz ? nz.strippedCursor : cursor, pitId, signal,
  reverse, noSource, missingFirst, nz?.sortOverride, nz?.extraFilter
)
if (nz) result.sortValues = remapNullZoneSortValues(result.sortValues, nz.sortClause, nz.primaryField)
```

Note that `dataSource.searchAfter()` already accepts `sortOverride` and `extraFilter` parameters ([`es-adapter.ts:524-525`](../../src/dal/es-adapter.ts)) and applies them inside the body builder. So phase-2 walks aren't bespoke `_search` calls in the store — they go through the same `searchAfter` API.

---

## What's broken in `getIdRange`

I (Opus 4.7, 1 May 2026) identified three suspected issues during S1 sense-check. **Verify each against current code before fixing — I described some imprecisely first time around.** Read the file, then form your own list before reading mine.

### Suspected bug 1 — cursor pass-back not sanitised

Code (around `es-adapter.ts:1599`):
```js
const lastHit = hits[hits.length - 1];
cursor = lastHit.sort;
```

The hit's `sort` array can contain sentinel numbers (`±9.2e18`) when the doc is at the null-zone boundary. The next iteration passes those raw to `_search` as `search_after`.

**Verify:**
- (a) Does ES 8.x NPE on a sentinel-numeric `search_after` value? The changelog NPE was triggered by `null` in `search_after`, not by sentinel numbers. If ES accepts sentinel-numeric cursors and just returns "no docs after `+Inf`", the failure mode is silent termination, not a 500. Either way it's a bug, but the fix urgency and visible symptom differ.
- (b) Does the existing `_sortValuesStrictlyAfter` comparison (which sees the sanitised `sv`) ever cause us to return early at the boundary even before we get to passing the cursor back?

**Investigation tools:** the existing changelog entries describe what `null` cursors do; what sentinel-numeric cursors do is not documented. Probably worth a brief test (a real ES query against TEST/CODE on a known-sparse field, READ-ONLY) to confirm.

### Suspected bug 2 — `_sortValuesStrictlyAfter` null logic is asc-biased

Code (around `es-adapter.ts:1466`):
```js
if (h == null) return true;  // null sorts last → h is after any non-null c
if (c == null) return false; // c is null (last) → h (non-null) is before c
```

The numeric branch IS direction-aware (`if (direction === "desc") return cmp < 0`). The null branch is not. ES uses `missing: "_last"` for asc and `missing: "_first"` for desc by default.

**Verify:**
- This helper is private to `getIdRange`. Confirm no other caller, then judge whether it should be fixed in place, replaced by a direction-aware primitive, or removed entirely if option C below is chosen (since `searchAfter` already does the iteration).
- Are there places in kupua where `missing: "_first"` is explicitly forced (`missingFirst` param to `searchAfter`)? If so, the helper would also need to know about that override.

### Suspected bug 3 — no two-phase walk (the structural one)

`getIdRange` calls `buildSortClause(params.orderBy)` once and walks single-phase. It never invokes `detectNullZoneCursor` / `remapNullZoneSortValues`. For any range that bridges the null-zone boundary (e.g. shift-click from a `taken`-populated doc through to a `taken`-missing doc, sorted by `taken`), the walk will:

- (1) page through docs in the populated zone normally;
- (2) hit the boundary — first hit's primary sort value is a sentinel that gets sanitised to `null`;
- (3) the asc-biased `_sortValuesStrictlyAfter` says "this is past `toCursor`" → return early;
- (4) **all null-zone docs in the requested range are silently missing from the result**.

No error, no toast. The user shift-clicks 800 items; the store gets 350.

**Verify:**
- Is the boundary actually crossed in the page-1 response, or does ES return one full page of populated docs first and then a separate page that starts in the null zone? If always the latter, the buggy path is "step 1 page → cursor advances to populated tail → step 2 page begins in null zone with a sentinel-bearing search_after cursor". This matters for the `cursor = lastHit.sort` story above.
- What happens when `fromCursor` is itself a null-zone cursor (i.e. the user shift-clicks two items both in the null zone)? Today: walk starts with `search_after: [null, ...]` and presumably returns nothing or NPEs. The two-phase pattern in search-store handles this case via `detectNullZoneCursor` on the START cursor, not just the running cursor.

---

## Investigation phase — decision required before code

Three plausible architectural answers. Pick one based on what the code actually says, not what this handoff guesses.

### Option A — Inline two-phase logic into `getIdRange`

`getIdRange` calls `detectNullZoneCursor(fromCursor)` itself, and if non-null, runs the walk in two phases (populated zone first, then null zone). Walks delegate to `this.searchAfter(...)` (which already supports `sortOverride` + `extraFilter`) instead of calling `_search` directly.

**Pro:** localised; `getIdRange` is self-contained.
**Con:** seventh copy of the pattern. Doesn't reduce the search-store's six call sites.

### Option B — Extract a `walkRange()` primitive in the DAL

A new method (or shared helper) that takes `(params, fromCursor, toCursor, signal, onHit)` and handles the two-phase walk + sentinel sanitisation + cursor pass-back internally. `getIdRange` becomes a thin caller. The six search-store call sites COULD be migrated to it (or not — they're using it for different purposes and a one-shot extraction risk-stops S3a).

**Pro:** correctness in one place; future search-store consolidation possible.
**Con:** designing the right API for both "walk a known range" (getIdRange) and "extend the buffer one chunk at a time" (search-store) is non-trivial. May need two primitives with shared internals.

### Option C — Make `getIdRange` use `searchAfter` directly with the null-zone params

Don't add new primitives. `getIdRange` becomes a loop that calls `this.searchAfter()` (which already handles sentinels via the `sanitizeSortValues` calls inside it) and applies its own toCursor stop condition + hard cap. On boundary crossing, `getIdRange` itself runs `detectNullZoneCursor` on the running cursor and switches to phase-2.

**Pro:** reuses the most battle-tested code path. Minimal new surface.
**Con:** `detectNullZoneCursor` lives in `search-store.ts`, not the DAL. Importing store helpers from the DAL is a layering wart. Either move it down (clean), or duplicate (ugly).

**Recommend:** read all three, pick one, justify briefly in a comment at the top of the new code. If you pick (B) or (C), you may need to first move `detectNullZoneCursor` and `remapNullZoneSortValues` from `search-store.ts` into a DAL-side helpers module (e.g. `src/dal/null-zone.ts`). That move is a separate, safe, mechanical refactor — do it as the first commit if needed.

---

## Fix phase — test-first protocol

After the architecture decision is made:

### Step 1 — Failing tests FIRST

Before touching `getIdRange`, write the failing tests that prove the bugs. Add them to `kupua/src/dal/selections-dal.test.ts`. Do NOT write the fix yet. Confirm each test fails for the right reason (e.g. "expected 800 IDs, got 350" — not "test setup error").

Required test cases (driving against `MockDataSource` with sparse-field fixtures — see step 2):

1. Range entirely in populated zone, asc — sanity baseline (should already pass).
2. Range entirely in populated zone, desc — sanity baseline.
3. Range entirely in null zone, asc — should return all matching IDs.
4. Range entirely in null zone, desc — should return all matching IDs.
5. Range crossing the boundary, asc — should return populated-tail + null-head.
6. Range crossing the boundary, desc — should return null-tail + populated-head.
7. `fromCursor` = sentinel-bearing cursor at the exact boundary, asc — must not under-count.
8. `fromCursor` IS a null-zone cursor (cursor[0] === null) — must walk null zone correctly.
9. `toCursor` IS a null-zone cursor — walk must not stop at the boundary.
10. Hard-cap truncation works correctly when the cap is hit in either zone.

If a test feels redundant after writing it, drop it. Aim for the minimum set that, if all pass, lets you say "null-zone correctness is proved."

### Step 2 — Sparse-field MockDataSource fixtures

`MockDataSource` (in `kupua/src/dal/mock-data-source.ts`) currently generates fully-populated images. The 3 April changelog refers to a "sparse MockDataSource (50k images, 20% lastModified coverage)" used for the original null-zone seek tests — locate that test setup pattern (search `lastModified` in test files) and adapt.

If no reusable sparse-fixture helper exists, build one:
- Take the existing `MockDataSource` constructor, add an option like `{ sparseField: 'taken', populatedFraction: 0.2 }` that drops `metadata.dateTaken` from 80% of generated images.
- The `getIdRange` mock implementation needs to honour the sparse field correctly (return the right `sort` arrays, including missing-field semantics matching ES).

### Step 3 — Fix

Implement Option A/B/C per investigation. Each test goes from red to green.

### Step 4 — Existing tests likely affected

Before the fix lands, grep for tests that call `getIdRange` or otherwise depend on its current single-phase behaviour. List them. After the fix, all of them must still pass — if any break, reason about whether the test was wrong or the fix is wrong.

If you choose Option B or C and move `detectNullZoneCursor` / `remapNullZoneSortValues` out of `search-store.ts`, all six call sites in `search-store.ts` need their imports updated. The behaviour must be identical — the move is purely mechanical. Run the full test surface to confirm.

### Step 5 — Run the FULL relevant test surface

- `npm --prefix kupua test` (unit) — mandatory.
- `npm --prefix kupua run test:e2e` (Playwright) — mandatory if any search-store or DAL behaviour changes (i.e. always for this fix).
- Warn the user about :3000 before running e2e.

---

## Anti-goals (do NOT do these)

- Do NOT wire `getIdRange` into `useRangeSelection` or any UI. That's S3a's job.
- Do NOT refactor `search-store.ts`'s six call sites beyond the mechanical import update if you move the helpers. The "consolidate the pattern across the store" work is a separate, larger refactor — note the opportunity in `deviations.md` or a follow-up TODO, but do not do it here.
- Do NOT add a UI toast for null-zone-related edge cases. UI is S3a.
- Do NOT touch the perf scaffolding (`e2e-perf/selection-stress.spec.ts`). Out of scope.
- Do NOT modify `getByIds`. Different beast, no null-zone interaction.
- Do NOT introduce write paths against ES. The safeguards in `es-adapter.ts#assertReadOnly` are sacred.

---

## Two minor concerns to fold in OR explicitly defer

These were also surfaced during S1 sense-check. They're cheap. Either fix as part of this session or document the deferral:

- **Dead import:** `RANGE_HARD_CAP` is imported at the top of `es-adapter.ts` but `getIdRange` reads it via `import.meta.env.VITE_RANGE_HARD_CAP` (for `vi.stubEnv` testability). Remove the dead import.
- **`getByIds` swallows AbortError per chunk → returns `[]` instead of rethrowing.** Inconsistent with the rest of `es-adapter.ts`. Probably a one-line fix, but verify no caller depends on the current behaviour.

---

## What done looks like

- [ ] Architecture decision (Option A / B / C) recorded as a comment at the top of the new `getIdRange` (or new helper module).
- [ ] If helpers were moved out of `search-store.ts`, all six call sites updated, all existing search-store tests still pass.
- [ ] All 10 (or trimmed) sparse-field test cases pass.
- [ ] `npm --prefix kupua test` — green.
- [ ] `npm --prefix kupua run test:e2e` — green.
- [ ] `deviations.md` updated if the fix introduces any new deviation (e.g. moving the null-zone helpers from store to DAL is worth noting).
- [ ] `changelog.md` entry under current phase, dated, describing the bug class, the fix path, and which option was chosen with a one-sentence justification.
- [ ] `worklog-current.md` updated.
- [ ] This handoff file (`getIdRange-nullzone-handoff.md`) deleted.
- [ ] Workplan's S3a "MUST address" block updated to remove the three null-zone items (the two minor concerns may stay or move depending on whether they were folded in).
- [ ] Commit suggested but NOT made without user approval.

---

## Reading order before starting

1. `kupua/AGENTS.md` (session-start context).
2. This file.
3. `kupua/exploration/docs/changelog.md` — entries dated 3 April, 4 April, 14 April, 26 April 2026 (search "null-zone" / "null zone"). Pay special attention to 26 April for the sentinel sanitisation history.
4. `kupua/src/stores/search-store.ts` lines 779–880 (`detectNullZoneCursor` + `remapNullZoneSortValues`) and one or two of the six call sites (e.g. `:906`, `:1078`).
5. `kupua/src/dal/es-adapter.ts` lines 55–75 (`sanitizeSortValues`), 514–680 (`searchAfter`), and 1438–1610 (the helper + `getByIds` + `getIdRange`).
6. `kupua/exploration/docs/00 Architecture and philosophy/05-selections.md` §6 (range selection — the consumer's expectations).
7. `kupua/exploration/docs/selections-workplan.md` Phase S3a (downstream impact you're unblocking).

Then decide if the push-back clause should fire. If not, proceed to investigation.
