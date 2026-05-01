# Selections — Workplan

> Implementation tracker for the selections feature. Architecture rationale
> lives in [`00 Architecture and philosophy/05-selections.md`](00%20Architecture%20and%20philosophy/05-selections.md).
> When v1 ships, this doc archives to `zz Archive/`.
>
> **Status (2026-05-01):** S0 complete. S0.5 next.

---

## Done state for v1 (after S5; S6 optional)

- All Vitest tests in `src/stores/selection-store.test.ts`, `src/lib/interpretClick.test.ts`, `src/lib/reconcile.test.ts` green.
- Playwright `e2e/local/selections.spec.ts` green across all tier profiles (buffer / two-tier / seek; fine pointer + coarse pointer).
- Field classification table from `selections-field-classification.md` fully implemented in `field-registry.ts`.
- No regressions in existing `e2e/` and `e2e-perf/` suites.
- `deviations.md` updated with the architecture §14 list.

## Per-phase discipline

- At the end of each phase: update `worklog-current.md` with a one-line decision summary; update `AGENTS.md` Component Summary if a new component is introduced (`selection-store`, `MultiImageMetadata`, etc.); detailed narrative goes into `changelog.md` when user asks for a commit.
- **Suggested model:** Sonnet 4.6 High for all phases. Reserve Opus only if a phase's open UX call genuinely stumps Sonnet — don't default-upgrade.

---

## ✅ Phase S0 — DAL additions — DONE (1 May 2026)

**Deliverable:** `getByIds` and `getIdRange` on `ImageDataSource` interface and the ES adapter.

- ✅ Add interface methods to `dal/types.ts` (+ `IdRangeResult` type).
- ✅ Implement on `ElasticsearchDataSource`:
  - `getByIds(ids, signal?)`: `mget` request, internally batched at 1000 IDs per request, returns `Image[]` with missing IDs simply absent (not `null`).
  - `getIdRange(params, fromCursor, toCursor, signal?)`: `search_after` walk with `_source: false`, sorted by current params, hard cap 5,000, returns `{ ids, truncated, walked }`.
- ✅ Implement on `MockDataSource`.
- ✅ Tests: 22 Vitest unit tests in `src/dal/selections-dal.test.ts`. All 452 tests pass.
- ✅ `"_mget"` added to `ALLOWED_ES_PATHS` in `es-config.ts`; `infra-safeguards.md` §3 updated.
- ✅ `RANGE_HARD_CAP` (5k), `RANGE_SOFT_CAP` (2k), `RANGE_CHUNK_SIZE` (1k) added to `constants/tuning.ts`.

**Decision recorded:** `RANGE_HARD_CAP` is read dynamically inside `getIdRange` via `import.meta.env` (matching `findKeywordSortValue` pattern) so `vi.stubEnv()` works in tests without module re-import.

---

## Phase S0.5 — Perf measurement scaffold (~½ session)

**Deliverable:** A perf harness that S1–S6 can drive before claiming "comfortable." Without this, every later phase flies blind.

- New `e2e-perf/selection-stress.spec.ts` (skeleton + helpers, no assertions yet — those land per-phase as numbers stabilise).
- Measures, at 1k / 2k / 5k selected items:
  1. Single-toggle latency (sync mutation → paint).
  2. Range-add total wall-clock and longest main-thread task during the lazy recompute.
  3. Persistence write cost (debounced sessionStorage write).
  4. Reconciliation chunk render time (per-chunk paint).
  5. Per-cell re-render count on mode-enter / mode-exit (target: 0 React renders, CSS-only state change).
- Reuses existing perf scaffolding from `e2e-perf/` where applicable (jank measurement, perceived-perf trace points).
- Lands BEFORE S1 so that S1's perf claims have something to assert against.
- *Scope: two-tier mode only.* Of the five measurements, only #2 (range-add) varies by code path, and what matters is **in-buffer fast walk vs `getIdRange` server walk** — not the scroll mode itself. Drive #2 twice (one small in-buffer range, one large out-of-buffer range) in two-tier; do NOT turn S0.5 into a mode matrix. Seek-mode-specific perf (anchor-evicted cursor swap on `walked === 0`) is better measured as a single datapoint in S3a's spec, not here. To force two-tier deterministically: `&query=city:Dublin` together with `STABLE_DATE` from the test config.

**Test surface:** Playwright with the existing perf config. No assertions in this phase — just instrumentation. Per-phase phases add their own thresholds.

**Why a phase, not a vague intent:** the architecture's cost envelopes are estimates. Without an early harness, every phase ends with "should be fast" and we never measure until something kneels in production.

---

## Phase S1 — Selection store + click interpreter (~1 session)

**Deliverable:** `selection-store.ts`, `interpretClick.ts` (the pure function), full unit test coverage. No UI yet.

- New store with `selectedIds`, `anchorId`, mutations, persistence wiring.
- `interpretClick.ts` — pure function with the rule table from architecture §5. Heavily tested; this is the contract.
- `metadataCache` LRU class (small, can colocate or new file).
- `ensureMetadata(ids)` calls `getByIds` via the DAL, populates cache, dedupes via `pendingFetchIds`.
- Reconciliation engine — `reconcile(image, prevState, fields)` and `recomputeAll(images, fields)`. Pure functions, fully tested. Lives in `src/lib/reconcile.ts`.
- Persistence via `persist` middleware: partialize to `[selectedIds (as Array), anchorId]`. Hydration triggers `ensureMetadata` for the persisted IDs and silently drops missing.

**Test surface:** Vitest only. ~40 tests anticipated (rule table cells × edge cases + reconciliation deltas + persistence round-trip + hydration drift).

**Implementation notes (gotchas surfaced by S3a rehearsal):**
- *`setAnchor(id)` MUST call `ensureMetadata([id])`* when `id` is non-null. Without this, S3a's server-walk path eats an extra `searchAfter({ ids: anchorId })` round trip on every shift-click whose anchor is out of buffer. The `setAnchor` path is the only place that knows the anchor is about to be used.
- *`add(ids[])` MUST call `ensureMetadata(ids)`*. Reconciliation cannot run on uncached items; we want the metadata fetch attached to the action. `toggle` already does this for the single-id case via the existing `ensureMetadata` queue — `add` is the bulk equivalent.
- *`add(ids[])` deduplicates against `selectedIds` BEFORE calling `ensureMetadata`.* Otherwise a range that includes already-selected items refetches them. Cheap fix, easy to forget.
- *`add(ids[])` is ATOMIC for persistence.* One sessionStorage write per `add` call, not one per id. The persist middleware should already batch within a single set() call, but verify — a naive forEach(toggle) would write 5,000 times. Use a single `set({ selectedIds: new Set([...prev, ...ids]) })`.
- *Persist middleware writes are DEBOUNCED.* Wrap the storage adapter so writes coalesce on a ~250ms trailing edge. Otherwise rapid toggling (Kahuna users do this with shift-click + click + click + click to refine a selection) thrashes sessionStorage with 5–20ms blocks per write. Custom storage wrapper, ~20 lines.
- *Lazy reconciliation engine.* Per architecture §7, `add(ids[])` does NOT synchronously recompute. It flips affected fields to `"pending"`, returns immediately, and schedules chunked recompute via `requestIdleCallback` (or `setTimeout 0` fallback). Build the chunked scheduler in S1 alongside the pure reconcile functions — it's not a separate phase. ~50 lines.
- *Reconciliation generation counter is monotonic and lives in the store.* Bumped by `toggle`, `add`, `remove`, `clear`, AND on each lazy-recompute chunk completion. Selectors memoise on it. Do NOT use object-identity of `selectedIds` — `Set` mutations don't change identity in some Zustand patterns, and we're going to need invariant ordering anyway.
- *Hydration `getByIds` runs AFTER state is rehydrated*, not synchronously during. That's so the rest of the app (search-store, panel) sees the ID set immediately and can render the count chip while metadata streams in.
- *Memory note.* 5,000 cached `Image` objects ≈ 25–50MB. Acceptable on desktop, tight on low-end mobile. v1 doesn't need a stricter cap (5k mobile selection is not a realistic user path), but log a `// PERF:` note on the LRU — if memory becomes a real issue, halve the cap on coarse-pointer profiles.

---

## Phase S2 — Desktop tickbox UI + Selection Status Bar (~1 session)

**Deliverable:** click and hover affordances in `ImageGrid` and `ImageTable`. New `SelectionStatusBar` component. End-to-end working selection on desktop, but Details panel still shows focused image only.

- `ImageGrid` cell: `Tickbox.tsx` overlay component shown on hover (fine pointer) or always when `inSelectionMode`. Click on tick → `interpretClick`, then dispatch effects to store + (rarely) navigate.
- `ImageTable` row: tickbox in the selection column (new column, always present, fixed narrow width). Same `Tickbox` component, same handler shape.
- `SelectionStatusBar` mounted in toolbar area. Count + Clear button.
- Wire `useIsSelected(id)` selector — focused subscription, single-row re-render on membership flip.
- `aria-checked` and keyboard support deferred to S3.

**Test surface:** Vitest for `Tickbox` rendering. Playwright `selections.spec.ts` (new) covering: hover reveals tick (fine pointer profile), click enters mode, second click adds, clear exits, mode persists across sort change.

**Implementation notes:**
- *Mode-enter/exit is CSS-driven, NOT per-cell React state.* `inSelectionMode` subscription happens ONCE at the grid/table container level, which sets `data-selection-mode="true"` on the container. Tickbox visibility is driven by `[data-selection-mode="true"] .tickbox { display: block; }` in CSS. Per-cell components do NOT subscribe to `inSelectionMode` — they would each re-render on mode flip (1,000+ React reconciliations on the first tick). Only `useIsSelected(id)` is a per-cell subscription.
- *Cell DOM placement.* Tickbox sits as an absolute-positioned overlay in the cell's top-left corner (~6px inset). z-index needs to clear any existing prefetch hover affordance in `ImageGrid` cell; check `ImageGrid.tsx` for current `hover:` Tailwind classes and confirm no overlap.
- *Two-tier mode skeleton cells.* When a cell is a skeleton (image not yet loaded in two-tier), the tickbox must NOT appear — there's nothing to select. `Tickbox` should accept `disabled` prop driven by `image === undefined`.
- *Hover semantics on fine pointer.* Reveal on `pointer-fine` only via the existing `pointer: coarse` detection in `ui-prefs-store.ts`. On coarse pointer, S2 leaves the tick hidden entirely — long-press in S5 is the entry path. Combine with the data-attribute selector: `[data-selection-mode="true"] .tickbox`, plus `.cell:hover .tickbox` on fine pointer when not in selection mode.
- *Table column placement.* Selection column is leftmost, fixed ~32px width, NOT user-hideable, NOT included in user column-resize state. Update `column-store.ts` defaults if needed but ensure backward compat with existing persisted user column state.
- *Selector subscription discipline.* `useIsSelected(id)` MUST use a per-id selector (not subscribe to whole `selectedIds`) or every cell re-renders on every toggle — the exact mistake Kahuna made (findings §3 Cause 4).
- *Effect-dispatch helper.* Both `ImageGrid` and `ImageTable` need to translate `ClickEffect[]` to store mutations + (later) range-hook calls. Build this as `dispatchClickEffects(effects, ctx)` in `src/lib/interpretClick.ts` (or a sibling) so S3a extends it with `add-range` handling rather than duplicating dispatch logic across two components.
- *No keyboard yet.* Space-to-toggle and shift-arrow-to-extend are S5 — Tickbox in S2 only handles pointer click. Mark with a `// TODO(S5):` comment so it's findable.
- *Perf gate.* Run the S0.5 perf harness: confirm mode-enter shows zero per-cell React renders (CSS-only state change). If any cell re-renders, the mode subscription leaked into the cell.
- *No keyboard yet.* Space-to-toggle and shift-arrow-to-extend are S5 — Tickbox in S2 only handles pointer click. Mark with a `// TODO(S5):` comment so it's findable.

---

## Phase S2.5 — Toast primitive (lands before S3, no rush) (~¼ session)

**Deliverable:** Reusable `useToast()` hook. Used in v1 for hydration drop, hard-cap truncation, soft-cap announcement, range error.

- `useToast()`: queue-backed, returns `toast.info(msg)` / `toast.warning(msg)` / `toast.error(msg)`. Single mounted `<ToastContainer />` in the layout. ~5s default duration, dismissible. ~80 lines incl. styling.
- No external deps (kupua's lean-deps discipline). Tailwind for styling.
- **`useConfirm()` deferred to Phase 3+** when actually destructive operations land (bulk edits, delete). v1 has nothing destructive — selections are non-destructive and reversible via Clear.

**Test surface:** Vitest for queue + ordering. One Playwright smoke check that a toast appears and dismisses.

---

## Phase S3a — Range selection (~1 session)

**Deliverable:** Shift-click range works in-buffer and across the buffer via `getIdRange`. Hard-cap truncation toast. Soft-cap announcement toast. No persistence-survives-search work yet (that's S3b).

> **MUST address before S3a is "done" — discovered during S1 sense-check (1 May 2026):**
>
> S0's `getIdRange` was implemented for the happy path. It is **incomplete against null-zone sorts** (sorts where the primary field is sparsely populated, e.g. `taken`, `lastModified`). Three bugs to fix in `es-adapter.ts#getIdRange` AND its tests before S3a wiring is trustworthy:
>
> 1. **Cursor pass-back must be sanitised.** The walk loop sets `cursor = lastHit.sort` directly. If the hit is at the null-zone boundary, ES returns `Long.MAX/MIN_VALUE` sentinels (`±9.2e18`) which then crash the next `_search` with an NPE 500. Wrap with `sanitizeSortValues()` (already present in `es-adapter.ts:59`). The same pattern is used at `es-adapter.ts:372`, `:612`, `:654`, `:1573` — match it.
> 2. **`_sortValuesStrictlyAfter` null logic is asc-biased.** It assumes nulls sort last, which is true for asc (`missing: "_last"`) but inverted for desc (`missing: "_first"`). Either branch on direction, or normalise null comparison via the same primitives `buildSortClause` uses. Add a unit test driving a desc sort over a nullable field.
> 3. **No two-phase null-zone walk.** The search-store's `detectNullZoneCursor` + `must_not: { exists: primaryField }` phase-2 walk (see `search-store.ts:779` and downstream callers `:906`, `:1078`, `:2072`, `:2219`, `:2488`, `:3151`) does NOT exist in `getIdRange`. Any range that bridges the null-zone boundary will silently truncate at the boundary or skip the entire null zone depending on which side the cursor sits. **This is the structural bug** — the other two are tactical fixes within the existing single-phase walk. Decision required: extract a shared two-phase walker, or have `getIdRange` call `detectNullZoneCursor` itself and split into two `_search` chains. Lean toward extraction — `search-store.ts` has six call sites of the same pattern and would benefit from consolidation. Out of scope for S3a's normal time budget; consider a half-session "S3a-prep" before S3a proper.

> **Minor concerns from the same review (less urgent — flag in S3a tests):**
>
> - **`add(ids[])` always marks all fields pending, even when items are already cached.** Currently `markPending` runs unconditionally before `ensureMetadata` resolves. If a range overlaps existing selection by even one item, that item's fields flicker pending → reconciled. Mirror `toggle()`'s pattern: split `ids` into cached vs uncached, fold cached ones synchronously via `reconcileAdd`, mark only uncached pending. Bug only becomes user-visible once S2 wires the panel.
> - **`getByIds` swallows AbortError per chunk → returns `[]`.** Inconsistent with the rest of `es-adapter.ts` which rethrows. Acceptable for selection-store callers (which ignore errors anyway), but worth aligning later.
> - **Dead import:** `RANGE_HARD_CAP` is imported in `es-adapter.ts` but `getIdRange` reads it dynamically via `import.meta.env.VITE_RANGE_HARD_CAP` (for `vi.stubEnv` testability). Remove the dead import.

- Click interpreter dispatches `add-range` (effect shape per architecture §5).
- New hook `useRangeSelection.ts` — orchestrates the in-buffer vs server-walk decision, abort on subsequent shift-clicks, post-add toast wording.
- Hard-cap (5,000) truncation — emits warning toast.
- Soft-cap (2,000) — emits info toast `"Added 2,400 items to your selection."` No prompt; the action proceeds.

**Test surface:** Vitest for the in-buffer/server decision logic (the `useRangeSelection` orchestrator extracted as a pure function for testability). Playwright covering: in-buffer range, range across two-tier buffer (mock server-walk), hard-cap truncation toast, soft-cap announcement toast.

**Implementation notes (gotchas — most surfaced by S3a rehearsal):**

*Mounting and store reads:*
- *Mount once in the route.* Mount `useRangeSelection` in [`src/routes/search.tsx`](../../src/routes/search.tsx) and pass `handleRangeEffect` as a prop to whichever of `ImageGrid` / `ImageTable` is rendered. Module-level abort state inside the hook covers density switches; a route-level mount avoids state loss on grid↔table toggle.
- *Imperative store reads.* `handleRangeEffect` MUST read search-store via `useSearchStore.getState()` at call time, NOT via `useSearchStore(s => s.bufferOffset)` captured at render. The hook fires from a click handler; the store may have advanced since the last render (e.g. a buffer extend completed mid-click). Stale `bufferOffset` would mis-classify in-buffer vs server-walk.

*The cancellation chain (the trickiest part):*
- Shift-click N starts a walk; shift-click N+1 arrives 200ms later. The N walk's `AbortSignal` MUST be aborted before N+1's walk starts, AND N's `add-range` effect MUST be discarded if the abort fires after the IDs land but before they're applied.
- Recommend: store the in-flight `AbortController` in a module-level ref keyed by a generation counter; only apply results matching the current generation. The generation guard is the load-bearing check — `signal.aborted` alone is insufficient because a result may already have crossed the await boundary by the time abort fires.

*In-buffer vs server-walk classification:*
- *Anchor index resolution.* Try in this order: (1) `anchorGlobalIndex` from the effect (if non-null, trust it); (2) `searchStore.imagePositions.get(anchorId)` (covers any anchor whose buffer cell is loaded); (3) two-tier mode: `positionMap.ids.indexOf(anchorId)` (pattern at [`search-store.ts:1375`](../../src/stores/search-store.ts) — O(N) scan, accepted at 65k); (4) fall through to server walk.
- *In-buffer fast-path edge case.* Anchor in buffer, target also in buffer, but they straddle a recent eviction — `bufferOffset` may have shifted between anchor-set and shift-click. Check global indices via `imagePositions` directly, not buffer-local indices.
- *Skeleton targets impossible.* Skeleton cells in `ImageGrid` ([line 120](../../src/components/ImageGrid.tsx)) render a plain div with no click handler. The user cannot click a skeleton. Therefore `targetGlobalIndex` is always defined when the click reaches `interpretClick`. State this as a comment in `useRangeSelection`; do not write defensive code for an impossible case.

*Anchor sort-cursor resolution (server-walk path):*
- If `anchorSortValues` provided in effect, use it. Otherwise look up anchor in `metadataCache` and call `extractSortValues(image, params.orderBy)` (see [`image-offset-cache.ts`](../../src/lib/image-offset-cache.ts)). Otherwise fall back to `dataSource.searchAfter({ ...params, ids: anchorId, length: 1 })` — same pattern as `_findAndFocusImage` Step 1 in [`search-store.ts`](../../src/stores/search-store.ts).
- If `setAnchor` correctly called `ensureMetadata([id])` (S1 cohesion rule), the searchAfter fallback should be vanishingly rare in practice.
- If all three fail (anchor genuinely deleted from ES), show a warning toast: `"The selection anchor is no longer available. Click an image to set a new anchor."` and return without applying.

*Cursor ordering for `getIdRange`:*
- When global indices are known on both ends, pass the sort-earlier cursor as `fromCursor`. When only one end has a known index (anchor evicted in seek mode), call `getIdRange` with the natural anchor→target order; if `walked === 0` AND `ids.length === 0`, swap and retry.

*ImageTable shift+click conflict (NOT in rehearsal — caught during review):*
- [`ImageTable.tsx:967`](../../src/components/ImageTable.tsx) currently uses `shift+click` on field-value cells for click-to-search. In Selection Mode the row-level selection handler must win for clicks on the *image cell*; the field-cell handler stays as-is for *other* cells. Verify by inspection: which DOM element gets the shift-click?
  - If the click target is a field-value cell, click-to-search fires (existing behaviour, untouched).
  - If the click target is the image cell or row whitespace, the selection range handler fires (new).
  - These should be naturally exclusive by event target, but write a Playwright check that confirms: shift-click on a field-value cell in Selection Mode still triggers click-to-search, not range-select.

*Error path UI:*
- If `getIdRange` errors (network, ES rejection), show an error toast, do NOT partially commit IDs, do NOT clear the anchor. The user can retry.

*Out of scope here:*
- *No persistence work.* Selections may already survive search via S1's persist wiring, but the drift counter and the hydration-toast UX is S3b. Do NOT bundle.

---

## Phase S3b — Persistence-survives-search UX (~1 session)

**Deliverable:** Selections survive search-param changes (the store already persists; this phase wires the drift UI and hydration polish). The `SELECTIONS_SURVIVE_SEARCH` escape hatch is in place. Hydration toast on missing items.

- `selectionCount` and `inViewCount` selectors. Status bar shows `12 selected` or `12 selected · 8 in view` per drift.
- `SELECTIONS_SURVIVE_SEARCH` constant in `constants/tuning.ts`. When false, `search()` orchestration calls `selection.clear()` first; status bar reverts to plain count.
- Hydration sequence: on mount, if persisted `selectedIds` non-empty, batch-fetch via `getByIds`, drop missing, fire one-time toast `"N selections from your last session were no longer available and have been dropped."` if drift > 0.
- The reconciliation engine continues to operate over all selected items, not just in-view items (selection-as-shopping-cart per architecture §9).

**Test surface:** Vitest for `inViewCount` derivation under various drift scenarios. Playwright for: select-then-search-then-back round-trip preserves selection; reload preserves selection; reload with deleted items shows toast; `SELECTIONS_SURVIVE_SEARCH=false` clears selection on search.

**Implementation notes:**
- *Hydration race.* Hydration runs on mount; the first search may also run on mount (URL sync). Order matters: hydrate selection FIRST (sync, from sessionStorage), then fire `getByIds` (async); if a search completes before `getByIds` resolves, that's fine — the cache fills out-of-band. Toast about drift fires when `getByIds` resolves, not when hydration starts.
- *Drift toast deduplication.* If the user reloads twice quickly (rare but possible), don't show the toast twice. Track a `_hydrationToastShown` flag in the store; reset on `clear()`.
- *`inViewCount` cost.* Naive impl is O(N_selected) per render. Memoise on `(selectedIds generation, results reference)` — these change rarely. Add a perf check in test if N gets large.
- *Switching the escape hatch.* When `SELECTIONS_SURVIVE_SEARCH` is false, the drift counter never appears, but the hydration toast SHOULD still fire (a user reloading mid-session is independent of search-survival policy). Or argue otherwise — worth a comment in `constants/tuning.ts` explaining the chosen interpretation.
- *Toast wording.* The exact wording in architecture §4 is a draft. Confirm with user before shipping.

---

## Phase S4 — Multi-image Details panel (~1 session)

**Deliverable:** `MultiImageMetadata` component. Field registry gains `multiSelectBehaviour` + `showWhenEmpty` flags. Reconciled view appears in panel when selection is non-empty.

- Extract `metadata-primitives.tsx` from `ImageMetadata.tsx` (shared internal module).
- `MultiImageMetadata.tsx` reads `reconciledView` via memoised selector.
- `MultiValue.tsx` for "mixed" rendering with sample-value popover.
- Field registry updates: classify each existing field with `multiSelectBehaviour` and `showWhenEmpty`. **Already done** — see [`selections-field-classification.md`](selections-field-classification.md). S4 implements the table.
- Keyword/subject/people occurrence counts (badge per chip).
- Panel branches `selectionCount === 0 ? Single : Multi`.

**Test surface:** Vitest for reconciliation correctness and "Multiple values" rendering. Playwright for: selection of items with same byline shows the byline; mixed bylines show "Multiple values"; hover reveals samples; field-registry classification table fully covered.

**Implementation notes:**
- *Reconciliation engine lives in S1, not S4.* The pure functions (`reconcile`, `recomputeAll`, the delta logic from architecture §7) belong in `src/lib/reconcile.ts` and are built/tested in S1. S4 only consumes them via the store. If you find yourself writing reconciliation logic in S4, you've put it in the wrong phase.
    - *Loading state.* Reconciliation needs metadata for every selected item. If `metadataCache` is missing some IDs OR if a chunked recompute is mid-flight, affected fields render with the per-field placeholder (subtle dash) in the value slot — label intact. NO panel-wide "Reconciling…" overlay (jarring on every range add). Exact placeholder visual is TBD on first sight; leave it tweakable. Per architecture §7.
- *Primitives extraction.* `ImageMetadata.tsx` currently inlines `MetadataSection`, `MetadataRow`, `MetadataBlock`, `FieldValue`. Extract to `metadata-primitives.tsx` BEFORE writing `MultiImageMetadata` — the refactor is its own commit, with the existing `ImageMetadata` test suite as the safety net. No behaviour change.
- *MultiValue popover UX.* On hover (fine pointer), reveal sample values + counts as a tooltip-style popover. On tap (coarse pointer), the popover opens on tap and closes on tap-outside. Use existing tooltip primitives if any; otherwise a minimal custom popover — do NOT introduce a popover library for this alone.
- *Empty/mixed display polish.* `all-empty` for a `showWhenEmpty: true` field renders the label with a subtle `—` value (kahuna parity — invites the eye to notice the gap). `mixed` renders the label with `Multiple values` in the value slot, not the label slot. Match Kahuna's text exactly per the per-field table in `selections-field-classification.md` where it differs ("Multiple titles", "Multiple bylines", etc.).
- *Field registry change.* Adding `multiSelectBehaviour` and `showWhenEmpty` to every field is touching ~33 entries. Mechanical change; reviewable in one commit per Section of the registry.
- *Performance gate.* Before declaring S4 done, run the perf scenario `e2e-perf/selection-stress.spec.ts` (S6 may need to bring this in early; create a stub here if S6 hasn't run). Validate that 5,000-item reconciliation stays under 50ms per render.

---

## Phase S5 — Touch / long-press + drag-extend (~1 session)

**Deliverable:** Mobile gestures for entering Selection Mode and extending. Drag-extend across visible cells (in-buffer only).

- New `useLongPress.ts` hook (coarse-pointer-gated).
- New `usePointerDrag.ts` hook for finger-drag extension.
- `Tickbox.tsx` always visible in Selection Mode on coarse pointer.
- Mobile-specific Status Bar styling (bottom sheet).

**Test surface:** Playwright with `pointer: coarse` device profile (Pixel 5, iPhone). Existing `playwright.tiers.config.ts` has touch profiles.

---

## Phase S6 (optional, defer-able) — Show-only-selected filter + perf hardening (~½ session)

**Deliverable:** "Show only selected" toggle filters results to `id:(...)` query. Perf measurements documented.

- Filter chip in toolbar.
- Perf measurement run (new perf scenario `e2e-perf/selection-stress.spec.ts`).
- Document where it kneels and why; backlog any P-class perf work.

Optional because the hard need is selection itself, not the filter; but the filter is a 30-line addition once everything else works.

---

## Open questions — all closed

1. ~~Status bar phrasing~~ — **Closed:** `12 selected` always, `12 selected · 8 in view` when drift exists. Layout shift accepted in v1; revisit if annoying.
2. ~~Toast infrastructure~~ — **Closed:** Strategy B (small reusable). Built in Phase S2.5.
3. ~~Confirmation dialog~~ — **Closed:** Not built in v1. Soft-cap is informational toast only. `useConfirm()` deferred to Phase 3+ when destructive operations land.
4. ~~Esc in Selection Mode~~ — **Closed:** does nothing.
5. ~~Tickbox click on focused image~~ — **Closed:** focus visually suppressed in Selection Mode but retained in memory (phantom-focus-style). Arrow keys behave as in unfocused state. See architecture §12.
6. ~~Per-field multiSelectBehaviour classification~~ — **Closed:** see [`selections-field-classification.md`](selections-field-classification.md). 33 fields classified (26 hardcoded + 7 default aliases). Drops directly into S4 implementation.
