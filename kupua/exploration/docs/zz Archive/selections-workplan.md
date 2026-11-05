# Selections — Workplan

> Implementation tracker for the selections feature. Architecture rationale
> lives in [`00 Architecture and philosophy/05-selections.md`](00%20Architecture%20and%20philosophy/05-selections.md).
> When v1 ships, this doc archives to `zz Archive/`.
>
> **Status (2026-05-03):** S0 + S0.5 + S1 + S2 + S2.5 + S3a + S4 + S5 + S6 complete. **S7 next (optional).**
>
> **Reorder note (2026-05-02):** former S3b (persistence-survives-search UX) moved to S6, after S4/S5, because it's architecturally independent of the multi-image panel and touch gestures, and because living with the current "survives everything" behaviour through S4/S5 gives real dogfooding data for the persistence-model decision. Former S6 (show-only-selected + perf) is now S7.
>
> **S6 reframe note (2026-05-03):** the shopping-cart analogy was rejected for v1 — durable persistence is Clipboard's concern (a future My Places component), not the underlying selection set's. S6 now ships "selections clear on most navigation" by default, gated by a `SELECTIONS_PERSIST_ACROSS_NAVIGATION = false` constant. The original drift counter (`12 selected · 8 in view`) and `inViewCount` selector are deferred to whenever Clipboard arrives — they're UI for a model we're not shipping in v1.

---

## Done state for v1 (after S6; S7 optional)

- All Vitest tests in `src/stores/selection-store.test.ts`, `src/lib/interpretClick.test.ts`, `src/lib/reconcile.test.ts` green.
- Playwright `e2e/local/selections.spec.ts` green across all tier profiles (buffer / two-tier / seek; fine pointer + coarse pointer).
- Field classification table from `field-catalogue.md` fully implemented in `field-registry.ts`.
- No regressions in existing `e2e/` and `e2e-perf/` suites.
- `deviations.md` updated with the architecture §14 list.

## Per-phase discipline

- At the end of each phase: update `worklog-current.md` with a one-line decision summary; update `AGENTS.md` Component Summary if a new component is introduced (`selection-store`, `MultiImageMetadata`, etc.); detailed narrative goes into `changelog.md` when user asks for a commit.
- **Suggested model:** Sonnet 4.6 High for all phases. Reserve Opus only if a phase's open UX call genuinely stumps Sonnet — don't default-upgrade.
- **MANDATORY before declaring ANY phase done that touched components / hooks / stores / scroll behaviour:** run `npm --prefix kupua run test:e2e` (warn user about port :3000 first; wait for confirmation). Paste the green summary into `worklog-current.md`. Vitest count alone does NOT count as "tests pass" — it has been the source of regressions caught days late. If any e2e fails, do NOT weaken the assertion to make it pass: stop, reason about whether the test is wrong, the new behaviour is wrong, or the change is intentional and the test needs an explicit update commit. Skipping this step has cost real time. The S2 phase added 7 new e2e specs but no implementer agent ran them — do not repeat that.

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

## ✅ Phase S0.5 — Perf measurement scaffold — DONE (1 May 2026)

**Deliverable:** A perf harness that S1–S7 can drive before claiming "comfortable." Without this, every later phase flies blind.

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

## ✅ Phase S1 — Selection store + click interpreter — DONE (1 May 2026)

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

## ✅ Phase S2 — Desktop tickbox UI + Selection Status Bar — DONE (1 May 2026)

> **Post-S2 visual amendments (1 May 2026):** `SelectionStatusBar` was folded directly into `StatusBar` (count + Material "clear" X button inline). Blue selected-cell overlay added via CSS `:has(.tickbox[aria-checked="true"])` — zero extra React subscriptions. Focus ring suppressed in selection mode. Right-panel Details placeholder shown in selection mode. Keyboard arrows treat selection mode as no-focus (scroll-only); table Left/Right scroll container horizontally.

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

## ✅ Phase S2.5 — Toast primitive — DONE (1 May 2026)

**Deliverable:** Reusable `useToast()` hook. Used in v1 for hydration drop, hard-cap truncation, soft-cap announcement, range error.

- `useToast()`: queue-backed, returns `toast.info(msg)` / `toast.warning(msg)` / `toast.error(msg)`. Single mounted `<ToastContainer />` in the layout. ~5s default duration, dismissible. ~80 lines incl. styling.
- No external deps (kupua's lean-deps discipline). Tailwind for styling.
- **`useConfirm()` deferred to Phase 3+** when actually destructive operations land (bulk edits, delete). v1 has nothing destructive — selections are non-destructive and reversible via Clear.
- **Types use BBC PR #4253 vocabulary exactly** (`ToastCategory`: 'information'|'warning'|'error'|'success'|'announcement'; `ToastLifespan`: 'transient'|'session'|'persistent') so future convergence is a 2-line adapter, not a type overhaul.
- `addToast()` imperative export for non-React callers (selection-store hydration in S6).
- `window.__kupua_toast_store__` in DEV for console testing.
- Dev-only `ToastDemoBar` in `search.tsx` (remove before S3a).

**Test surface:** 13 Vitest tests in `ToastContainer.test.tsx`. 5 Playwright smoke tests in `e2e/local/toast.spec.ts`. 564 total tests passing.

---

## ✅ Phase S3a — Range selection — DONE (2 May 2026)

**Deliverable:** Shift-click range works in-buffer and across the buffer via `getIdRange`. Hard-cap truncation toast. Soft-cap announcement toast. No persistence-survives-search work yet (that's S6).

> **Pre-S3a follow-ups (from S1 sense-check, 1 May 2026):**
>
> - **`getIdRange` null-zone correctness — DONE in commit `c1998394b`.** Phase-2 walk now triggers correctly at the boundary; null-zone helpers extracted to [`src/dal/null-zone.ts`](../../src/dal/null-zone.ts); 8 sparse-field test cases in `selections-dal.test.ts`. The asc-bias suspected bug was investigated and refuted (ES uses `missing: "_last"` regardless of direction).
> - **`add(ids[])` over-marks pending — STILL OPEN, fix in S3a.** Currently `markPending` runs unconditionally before `ensureMetadata` resolves. If a range overlaps existing selection by even one item, that item's fields flicker pending → reconciled. Mirror `toggle()`'s pattern: split `ids` into cached vs uncached, fold cached ones synchronously via `reconcileAdd`, mark only uncached pending. Becomes user-visible once S2 wires the panel; fix as part of S3a's range-add work.
> - **`getByIds` swallows AbortError per chunk → returns `[]` — STILL OPEN, low priority.** Inconsistent with the rest of `es-adapter.ts` (which rethrows). Acceptable for the current selection-store caller (which ignores errors anyway), but worth aligning when convenient.

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
- *No persistence work.* Selections may already survive search via S1's persist wiring, but the drift counter and the hydration-toast UX is S6. Do NOT bundle.

---

## ✅ Phase S4 — Multi-image Details panel — DONE (3 May 2026)

**Deliverable:** When `selectionCount >= 2`, the right-hand panel shows a `MultiImageMetadata` view: per-field reconciled values across the selection, partial/full chip rendering for keywords/people/subjects, and per-segment location. When `selectionCount === 1`, the panel renders the existing single-image `ImageMetadata` byte-identically. Field registry gains `multiSelectBehaviour` + `showWhenEmpty` columns wired all the way through.

### Starting state (read this before touching code)

- **Field registry.** `field-registry.ts` has **no** `multiSelectBehaviour` or `showWhenEmpty` properties on `FieldDefinition` today (verified 2 May 2026). The classifications in [`field-catalogue.md`](field-catalogue.md) are doc-only. S4 wires both columns into the `FieldDefinition` type and populates all 37 implemented rows.
- **Reconciliation engine.** [`reconcile.ts`](../../src/lib/reconcile.ts) currently implements scalar paths only — `all-same`, `all-empty`, `mixed`, `pending`, `dirty`. S4 adds the `chip-array` and `summary` variants (already declared in arch §3). The chunked scheduler in `selection-store.ts` (`processReconcileChunk`) is mode-agnostic and needs no changes — extending the per-field reducer is enough.
- **Selection-of-one rule.** Mandatory and non-negotiable (arch §8, catalogue §"Selection-of-one rule"). A 1-image selection renders `ImageMetadata` verbatim. The multi-select code path (`always-suppress` filtering, partial/full chips, summary lines, "Multiple values" placeholders) gates on `selectionCount >= 2`. The route-level branch is `count === 0 ? <FocusedImageMetadata /> : count === 1 ? <ImageMetadata image={selectedImage}/> : <MultiImageMetadata />`. This is *why* the primitives extraction is Step 1 — both components must share row rendering, otherwise the count=1 panel will silently drift from the single-image panel.
- **Right-panel placeholder.** [`search.tsx`](../../src/routes/search.tsx) (~line 238) already shows a placeholder in selection mode (post-S2 amendment). S4 replaces that placeholder with the count branch above.

### Build order

1. **Extract `metadata-primitives.tsx`** from `ImageMetadata.tsx`. Move `MetadataSection`, `MetadataRow`, `MetadataBlock`, `FieldValue`, `ValueLink` into the new module. `ImageMetadata.tsx` re-imports them. **Pure refactor, zero behaviour change** — existing `ImageMetadata` tests are the safety net. Commit on its own. If any existing test regresses, the extraction is wrong; do not patch tests to match new behaviour.
2. **Extend `FieldDefinition`** in `field-registry.ts` with `multiSelectBehaviour: "reconcile" | "chip-array" | "always-suppress" | "show-if-all-same" | "summary-only"` and `showWhenEmpty?: boolean`. Populate all 37 implemented rows from the catalogue. Mechanical; group commits by registry section if the diff is uncomfortably large. The 9 `pending-implementation` fields stay absent — they are field-parity work, not S4. **Special:** `metadata_imageType` must be gated on `gridConfig.imageTypes?.length > 0` (Kahuna parity, decided 2026-05-02); add a `visibleWhen?: () => boolean` predicate or wrap the registry entry in a build-time conditional — pick whichever is less invasive.
3. **Extend `reconcile.ts`** with the two new variant reducers:
   - `chip-array` reducer: group-by-value across selected images, return `{ kind: "chip-array", chips: Array<{ value, count }>, total }`. `total === selectedIds.size`. Lazy/chunked exactly like the scalar path.
   - `summary` reducer: takes a per-field summariser function from the field definition; called once after metadata is hydrated for the selection, returns `{ kind: "summary", line: string }`. Used by `lease_summary` (when implemented) — for S4 the only `summary-only` consumer is the planned leases field, which is *not* in S4 scope. **Therefore the `summary` reducer is built and unit-tested but has no production caller in S4.** Wire it now so the field-parity session that adds leases doesn't have to touch reconciliation at all. *(Push back if this looks like over-engineering: the alternative is shipping S4 without `summary` and reopening `reconcile.ts` later. The variant declaration already exists in arch §3 — adding the reducer alongside `chip-array` is ~30 lines and gives test coverage now.)*
   - **`show-if-all-same` is NOT a new reducer.** It uses the existing scalar `all-same`/`all-empty`/`mixed` output; the *renderer* hides the row unless `kind === "all-same"`. No reconciliation change.
   - **`always-suppress` is NOT a reducer.** It is a registry-level filter applied before reconciliation runs (skip the field entirely from `RECONCILE_FIELDS`).
4. **Build `MultiSearchPill`** in `SearchPill.tsx` (extend the existing file — it already houses `SearchPill` and `DataSearchPill`). New prop: `partial: boolean`. Visual contract per the CSS section below. Same click-to-search behaviour as `SearchPill`. Add a `data-partial` attribute on `DataSearchPill` so the same CSS rule covers the table.
5. **Build `MultiValue.tsx`** for the `mixed` scalar case. Renders `"Multiple <field-label-pluralised>"` (per-field strings, see catalogue table — `"Multiple titles"`, `"Multiple bylines"`, etc.). **Sample-value popover deferred to a follow-up** — for v1, set `title={sampleValues.join(", ")}` on the element so hover gives a native browser tooltip. No popover library. No custom popover. The decision: ship the value reveal as a native `title=` attribute and revisit only if dogfooding asks for it. *(Push back welcome: native title is ugly and slow to appear. But adding a popover here is rope to hang ourselves with — it's the kind of thing that consumes a session. Keep S4 lean.)*
6. **Build `MultiImageMetadata.tsx`.** Subscribes to `reconciledView` via a memoised selector keyed on the store's generation counter. For each field in `RECONCILE_FIELDS` (registry-filtered to drop `always-suppress`):
   - `pending` / `dirty` → render the row with the placeholder (see CSS below) in the value slot, label intact.
   - `all-empty` → if `showWhenEmpty: true`, render the row with placeholder; else hide.
   - `all-same` → render via the same `FieldValue`/`ValueLink` primitives as `ImageMetadata` (chip-array fields render the chip with `partial: false`).
   - `mixed` → for scalar fields, `<MultiValue field={...} sampleValues={...} />`. For chip-array fields, render the union with per-chip `partial = chip.count < total`.
   - `chip-array` kind directly → render the chip union as above.
   - `show-if-all-same` registry behaviour → only render when the field's reconciliation is `all-same`; suppress on `mixed`.
   - `summary` kind → render `<dd>{line}</dd>` plain text.
   - **Per-segment location**: `subLocation`, `city`, `state`, `country` are four independent scalar reconciliations grouped under one "Location" section header. Each segment renders independently — all-same shows the value as a clickable `ValueLink`; mixed shows `"(Multiple cities)"` etc. matching Kahuna text from catalogue.
7. **Wire the route branch** in `search.tsx`: replace the post-S2 selection-mode placeholder with the three-way `count` branch.
8. **Run the full test surface** (see §"Test surface" below) and the perf gate.

### CSS — Kahuna palette mapped to Kupua tokens

Kahuna's `list-editor.css` (`.image-info__pills` block, lines 99–124) is the source. The mechanism is a single class, `element--partial`, applied per chip; full chips inherit the default. Translation:

| State | Kahuna | Kupua (Tailwind) |
|---|---|---|
| Full chip background | `#222` | existing `bg-grid-cell-hover/60` (matches current `SearchPill`) |
| Full chip text | `#aaa` | existing `text-grid-text` |
| Partial chip background | `white` | `bg-transparent` |
| Partial chip text | `#222` | `text-grid-text-dim` |
| Partial chip border | implicit (white-on-dark) | `border border-grid-cell-hover` |
| Hover (both) | inverse colours | existing `hover:bg-grid-accent/20 hover:text-grid-accent` |

Implementation: `MultiSearchPill` switches its `className` on `partial`. Avoid duplicating the full-chip palette — reuse the `SearchPill` class string. For the table (`DataSearchPill`), add a single CSS rule in `index.css` keyed on `[data-partial="true"]` that overrides `bg-*` and adds the border. **No new colour tokens needed.**

The `Multiple values` text and the empty-field placeholder use the same dim-text token: `text-grid-text-dim` (italic optional — Kahuna doesn't italicise; Kupua matches). Placeholder character is `—` (em-dash) wrapped in a span with `text-grid-text-dim/50` opacity. No animation, no skeleton shimmer in v1.

### Out of scope for S4

The 9 `pending-implementation` fields in [`field-catalogue.md`](field-catalogue.md) — `labels`, `photoshoot`, `lease_summary`, `cost_state`, `syndication_rights`, `domain_metadata`, `identifiers_derivative`, `identifiers_replaces`, `usageInstructions`. Each needs data plumbing Kupua doesn't have (userMetadata namespace, leases API, photoshoot service, RCS, derived cost field, BBC config-driven shapes). S4 wires reconciliation for the 37 *existing* fields and lays the type/reducer scaffolding so the field-parity session that adds these is purely additive.

Subjects editing in multi-select. Kahuna gates this `is-editable="false"`; Kupua matches — read-only chips, no edit affordance ever. Not deferred, **rejected by design**.

`MultiValue` popover with sample values + counts. Deferred (see Step 5). Native `title=` is the v1 affordance.

Bulk-edit pencil affordance. Phase 3+. The `FieldReconciliation` shape carries enough state to drive it later.

### Test surface

- **Vitest, `reconcile.test.ts` extensions:** all four `kind` outcomes for the new reducers — `chip-array` with all-overlap (every chip on every image) and partial-overlap, `summary` with the leases-style summariser. Plus the four scalar outcomes already covered.
- **Vitest, `field-registry.test.ts` extensions:** every registered field has a `multiSelectBehaviour`; `always-suppress` fields are absent from `RECONCILE_FIELDS`; `metadata_imageType` is gated by config.
- **Vitest, `MultiImageMetadata.test.tsx` (new):** count=1 renders `ImageMetadata` byte-identically (snapshot or DOM-equality vs single-image render of the same image); count=2 with same byline shows the byline; count=2 with mixed bylines shows `"Multiple bylines"`; partial keyword chip carries the `data-partial` attribute / hollow class; per-segment location with all-same country + mixed city renders both rows correctly; `always-suppress` field never appears.
- **Playwright, `e2e/local/selections.spec.ts` extensions:** select two images of same byline → byline visible in panel; select two of different bylines → "Multiple bylines"; partial chip is visually hollow (assert via class or computed style); leases section absent (until field-parity ships); single-image selection renders the same DOM as click-to-open detail of that image.
- **Mandatory before declaring done:** `npm --prefix kupua run test:e2e` per the workplan discipline rule. Warn user about port :3000 first.
- **Perf gate:** `e2e-perf/selection-stress.spec.ts` — 5,000-item reconciliation under 50ms per render. **Watch chip-array specifically** — keywords have high cardinality (15+ per image; 5k selection could surface thousands of distinct chips). If it kneels, options in order: (a) cap display at top-N chips by count with `"+ M more"` affordance; (b) lower max selection size; (c) virtualised chip list. Decide on measured numbers; do not pre-optimise.

### Done state checklist

- [x] `metadata-primitives.tsx` extracted; `ImageMetadata.tsx` imports from it; existing `ImageMetadata` tests green with no edits.
- [x] `FieldDefinition` has `multiSelectBehaviour` + `showWhenEmpty`; all 37 implemented rows populated; `metadata_imageType` config-gated.
- [x] `reconcile.ts` exports `chip-array` and `summary` reducers; both unit-tested.
- [x] `MultiSearchPill` shipped; `DataSearchPill` accepts `data-partial`; CSS rule added.
- [x] `MultiValue.tsx` shipped with `title=` sample reveal.
- [x] `MultiImageMetadata.tsx` renders all field kinds; route branch wired in `search.tsx`.
- [x] Vitest green (601 tests); Playwright e2e green (220 tests); perf gate met.
- [x] AGENTS.md component summary updated; `deviations.md` entries added; changelog pending commit.

### Post-S4 polish applied (3 May 2026)

- **Bug:** `toggle()` missing `enqueueReconcile` after `ensureMetadata` — panel stuck at dashes on second selection. Fixed.
- **Bug:** `mimeType` showing raw value not formatted string in multi-panel. Fixed via `label` prop on `ValueLink`.
- **Bug:** Single-selected image metadata disappearing when scrolled past buffer. `FocusedImageMetadata` now falls back to `metadataCache` for the single-selected item.
- Location sub-fields collapsed into one composite "Location" row in multi-panel.
- Multi-panel wrapper and "N images selected" footer removed — visual parity with single-image panel.
- Chips sort by popularity (desc) in multi-panel.
- Chip tooltips show count: `"Business (on 12 of 47)"`.

---

## ✅ Phase S5 -- Touch / long-press + range (DONE, 2026-05-03)

> **Paint-drag (gesture A/H) was cut.** `usePointerDrag.ts` was written and wired but
> deleted before shipping. Root cause: the browser reads `touch-action` at `pointerdown`
> time (~0ms). Our long-press commits at 500ms. Setting `touch-action: none` at commit
> time is too late -- the browser has already decided the gesture may scroll, and any
> subsequent pointermove fires `pointercancel`. The only fix is setting `touch-action:
> none` permanently on the container while in selection mode, which disables scrolling
> entirely while items are selected (unacceptable UX). Option A (no drag-paint, tickbox
> taps + second-long-press range only) was chosen. All paint/autoscroll code removed.

**What shipped:**
- `useLongPress.ts` -- long-press entry gesture (500ms threshold, movement cancel, context-menu suppress, Android pointercancel fix)
- Second long-press dispatches a full `add-range` effect (same path as desktop shift-click, including buffer/server walk) -- A long-press B long-press C selects all three
- Desktop drag-to-collection (HTML5 `draggable`, fine-pointer only via `IS_COARSE_POINTER`)
- `SelectionFab` -- floating action button (bottom-right) on coarse pointer: shows count + X to clear
- StatusBar count/clear hidden on coarse pointer (FAB owns it)
- 7 Playwright mobile tests (Pixel 5 emulation), all passing
- 617 Vitest tests passing

**Not done (deferred):**
- Paint-drag (cut, see above)
- Group-header-tap (no grouping in Kupua yet -- handler latent)
- Haptic feedback (flaky on iOS, deferred)
- iOS Safari real-device smoke

**Deliverable:** Mobile gestures for entering Selection Mode and extending, modelled on Google Photos. Long-press to enter mode + select; long-press-and-drag to paint-toggle a range; group-header tap to select-all-in-group; auto-scroll at viewport edges; bottom-sheet status bar. Long-press-then-long-press also dispatches a desktop-style anchor-intent range (free coexistence — see G below).

> **Reference behaviour confirmed by user testing of mobile Google Photos (2026-05-03):**
> A. Drag back over already-crossed cells deselects them.
> B. Group-header has a circle/check; tap selects/deselects the whole group. During an active drag the dragged set shows as a "deck" icon with count badge top-right of the lift origin (we will use this on desktop too — note for a later phase).
> C. Long-press is the ONLY entry to a new range, even when already in selection mode. Plain drag scrolls the page.
> D. No auto-scroll acceleration in GPhotos — constant slow speed near edges. We will match (option to add a mild ramp later if measured-needed).
> E. Long-press threshold = Android default 500ms.
> F. Tap on empty area in selection mode = no-op.
> G. GPhotos does NOT have tap-then-long-press range. Kupua adds it because it's free (same `useRangeSelection` already shipped for desktop shift-click). Coexists with drag — different gestures, different polarities.
> H. Drag is **paint-toggle**: every cell the finger ENTERS during the active drag is toggled once, regardless of prior state. Re-entering toggles again. This explains both the drag-back-deselects behaviour (A) and the cross-already-selected-deselects behaviour (the "weird" thing).

### Out of scope for S5

- **Mobile density (2-column default).** Currently Kupua uses 1-column on mobile; gestures work the same regardless of column count. Density change becomes its own phase ("S5.5 mobile density") after S5 ships and we have a working gesture surface to test density against. Doing density first changes test baselines and screenshots; doing gestures first keeps the diff focused.
- **Pinch-to-zoom-out density toggle** (the GPhotos 4-3-2-1 column switcher). Belongs with the density phase, not gesture phase.
- **"Select all" via month-header pinch flow.** Kupua doesn't group by date; not applicable.
- **Group-header-tap on a flat (ungrouped) grid is undefined.** Until Kupua introduces day/month grouping (no current plan), there are no group headers to tap. The S5 group-header logic ships *latent* — the handler exists, no DOM target wires to it. When grouping ships, wire the existing handler to the new headers.
- **"Deck" icon during active drag.** Visual polish; defer unless trivial. Note for desktop polish phase.
- **Haptic feedback.** Web Vibration API works on Android Chrome; flaky on iOS Safari. Not worth the inconsistency for v1.
- **Drag while NOT in selection mode but starting on a cell already selected from a prior gesture.** With the long-press-required rule (C), this can't happen — drag without long-press scrolls. No special case.

### Implementation

**1. New hook: `useLongPress.ts`** — generic, coarse-pointer-aware.

- Triggers on `pointerdown` with `pointerType === "touch"` (or coarse-pointer media query as belt-and-braces).
- Threshold: `LONG_PRESS_MS = 500` in `constants/tuning.ts`.
- Movement cancellation: if the pointer moves more than `LONG_PRESS_MOVE_TOLERANCE_PX = 10` BEFORE the threshold fires, the long-press is cancelled (treat as a scroll gesture; do not preventDefault).
- Scroll cancellation: if a scroll event fires before threshold, cancel.
- Calls `onLongPressStart(cellId, clientX, clientY)` when threshold reached. At this point: the gesture has committed, `usePointerDrag` (below) takes over, and native scroll is suppressed via `touch-action: none` on the grid container WHILE a long-press is active (toggle the data attribute).
- On `pointerup` BEFORE drag movement exceeds threshold: calls `onLongPressTap(cellId)` — this is a static long-press with no drag.

**2. New hook: `usePointerDrag.ts`** — drives paint-toggle once `useLongPress` commits.

- Subscribes to `pointermove` after long-press commit.
- For each `pointermove`, hit-tests via `document.elementFromPoint(clientX, clientY)` and walks up to find the nearest `[data-cell-id]` ancestor.
- Maintains a `Set<string> visitedThisGesture`. When a new cellId is entered (not in set), push to set AND fire `onCellEntered(cellId)`. When the pointer LEAVES a cell and re-enters (same cell, after exiting), the set entry was removed on exit — re-entry counts as a fresh entry (paint-toggle re-fires). Implementation: track `lastCellId`; on each move, if hit !== lastCellId, fire `onCellEntered(hit)` and set `lastCellId = hit`.
- Edge auto-scroll: when `clientY` is within `EDGE_SCROLL_BAND_PX = 80` of the viewport top or bottom (relative to the scrollable grid container, not window), scroll the container at `EDGE_SCROLL_SPEED_PX_PER_SEC = 600`. Constant speed (no ramp), per (D). Requestanimationframe loop runs while in band; stops when out of band or on `pointerup`.
- On `pointerup` or `pointercancel`: clear set, stop auto-scroll, drop `touch-action: none` from grid container.

**3. Wire into `useRangeSelection.ts` (existing) — paint-toggle handler.**

The existing hook handles desktop shift-click ("add-range" effect, anchor-intent polarity). Add a new effect type `paint-toggle` dispatched from `usePointerDrag.onCellEntered`:

```ts
// In dispatchClickEffects.ts
type Effect =
  | { type: "toggle"; id: string }
  | { type: "add-range"; anchorId: string; targetId: string; polarity: "add" | "remove" }
  | { type: "paint-toggle"; id: string };  // NEW
```

`paint-toggle` is just a thin alias over `toggle` — single-cell flip — but kept distinct because the dispatcher must NOT also `setAnchor(id)` for paint-toggle entries (only the long-press anchor sets the anchor). Also helpful for telemetry/debugging if we ever want to see paint-toggle vs explicit-toggle counts.

Anchor handling: the long-press start fires `toggle(anchorId) + setAnchor(anchorId)` (per the existing rule that setAnchor calls ensureMetadata). All subsequent paint-toggle entries during the same gesture fire `toggle(id)` only — no anchor change. After pointerup, anchor remains set to the long-press cell (so a subsequent long-press-on-different-cell triggers the anchor-intent range path, see §G below).

**4. Long-press-then-long-press range (G) — free win.**

Reuse the existing `useRangeSelection` hook as-is. The disambiguation is in the `useLongPress.onLongPressTap` callback (no drag movement before pointerup):

- If no anchor set → `toggle(id) + setAnchor(id)`. (mode entry)
- If anchor set AND `id === anchorId` → `toggle(id) + setAnchor(null)`. (deselect anchor; standard toggle)
- If anchor set AND `id !== anchorId` → dispatch `add-range` effect with anchor-intent polarity. (range select)

This means tap-anywhere-then-long-press-elsewhere ranges work mobile-side too. Users may never discover it (GPhotos users haven't), but it costs nothing.

**5. Tickbox always-visible in selection mode on coarse pointer (S2 ALREADY HANDLES).**

S2's CSS rule `[data-selection-mode="true"] .tickbox { display: block; }` already covers this. No additional work; verify via Playwright on coarse pointer profile.

**6. Group-header tap (latent).**

Add a `data-group-id="..."` attribute on group-header DOM (when grouping ships) and a tap handler that calls a new selection-store action `selection.addGroup(ids[])` / `selection.removeGroup(ids[])`. The action is part of S5's deliverable (because the implementation is small and the action shape needs to be right); the *DOM target* is added when grouping ships. **For S5: ship the action + a Vitest unit test, no UI wire.**

**7. Bottom-sheet status bar styling.**

The existing `StatusBar` already shows `count + Clear` on right side (S2 polish). On coarse-pointer profiles AND mode active, restyle as a bottom-fixed bar:

- `position: fixed; bottom: 0; left: 0; right: 0;` with safe-area inset padding (`env(safe-area-inset-bottom)`).
- Slide-in from bottom on mode-enter (CSS transition, 200ms ease-out). Slide-out on mode-exit.
- Background opaque (matches header background). Z-index above grid, below toasts.
- Action area on the right: `Clear` (X icon) + later (S4) the bulk-action buttons. Same buttons as desktop, just relocated.
- Touch targets ≥ 44px.

CSS-only branching via `[data-coarse-pointer="true"][data-selection-mode="true"]`. No new components, no JS branching.

### Files touched

- NEW: `kupua/src/hooks/useLongPress.ts` (~80 lines).
- NEW: `kupua/src/hooks/usePointerDrag.ts` (~120 lines incl. auto-scroll loop).
- NEW: `kupua/src/hooks/useLongPress.test.ts`, `usePointerDrag.test.ts` (Vitest, jsdom pointer-event simulation).
- `kupua/src/lib/dispatchClickEffects.ts`: add `paint-toggle` effect type and dispatcher.
- `kupua/src/hooks/useRangeSelection.ts`: no change for paint-toggle (it goes through dispatchClickEffects directly, not useRangeSelection); the long-press-then-long-press path reuses the existing add-range effect.
- `kupua/src/stores/selection-store.ts`: add `addGroup(ids[])` / `removeGroup(ids[])` actions (atomic, batched, ensure-metadata for missing).
- `kupua/src/components/ImageGrid.tsx`: mount `useLongPress` + `usePointerDrag` on the grid container; add `data-cell-id` attribute on each cell (already exists?); toggle `touch-action: none` data attribute during long-press commit.
- `kupua/src/components/ImageTable.tsx`: same as grid, with `data-cell-id` on each row's image cell.
- `kupua/src/components/StatusBar.tsx`: add `data-coarse-pointer` data attribute (read from existing `ui-prefs-store`).
- `kupua/src/index.css`: bottom-sheet styles for `[data-coarse-pointer="true"][data-selection-mode="true"]` StatusBar; auto-scroll cursor hint.
- `kupua/src/constants/tuning.ts`: `LONG_PRESS_MS`, `LONG_PRESS_MOVE_TOLERANCE_PX`, `EDGE_SCROLL_BAND_PX`, `EDGE_SCROLL_SPEED_PX_PER_SEC`.

### Implementation notes (gotchas)

- *iOS Safari pointer events.* `pointerdown` fires reliably; `pointermove` outside the original element requires `setPointerCapture(pointerId)` on the grid container at long-press commit. Without capture, drag past the original cell triggers `pointerleave` and stops fire. **Test on real iOS Safari, not just Playwright iPhone profile** — Playwright's device emulation does not always reproduce capture quirks.
- *`touch-action: none` scope.* Must be on the SCROLLABLE grid container, not on body, or scroll is permanently disabled if a gesture errors out without cleanup. Always pair the data-attribute toggle with a `pointerup` / `pointercancel` listener that clears it. Prefer `useEffect` cleanup in the hook.
- *`elementFromPoint` cost.* Called per `pointermove` (potentially 60-120 Hz). Profile on a low-end Android — if it's a hot spot, throttle to rAF (target 60 fps) instead of every move event. Don't pre-optimise.
- *Long-press commits while finger still down → no `click` event.* Browsers suppress `click` after `pointerdown` if `preventDefault` was called or capture was set. That's what we want — a long-press should not also fire a tap. Verify by counting events in the test.
- *Cancellation chain.* If a scroll occurs (browser native scroll because long-press never committed), make sure the long-press timer is cleared. If a long-press commits and then a `pointercancel` arrives (system gesture, dialog appears), clean up: stop auto-scroll, clear `visitedThisGesture`, drop `touch-action`. On `pointercancel`, do NOT roll back the toggles — the user has already seen them, surprise > consistency would be worse here.
- *Skeleton cells in two-tier mode.* `data-cell-id` should NOT be set on skeletons. Drag entering a skeleton is a no-op; treat as if no cell at that position. `usePointerDrag.lastCellId` stays at the previous valid id; entering a real cell after skipping skeletons fires entry as expected.
- *Anchor in selection-store after pointerup.* Long-press anchor stays anchored. A subsequent long-press elsewhere fires range-extend (G). User-visible: the long-press tap on an empty cell after a drag ALSO triggers a range-extend back to the drag's origin. Verify this is acceptable; if not, clear anchor on `pointerup` after a drag (only). **Open call: clear-anchor-on-drag-end?** Recommend NO — keeping anchor lets users do "select these few, then add a range to here" which is a natural follow-up.
- *Tickbox tap inside selection mode — must NOT trigger long-press path.* Tickbox is a separate DOM target with its own click handler; `useLongPress` listens on the cell, not the tickbox. Tap on tickbox fires immediate `toggle(id)`, not long-press. **Verify**: `useLongPress` short-circuits if `event.target` matches `[data-tickbox]`.
- *Group action atomicity.* `addGroup(ids[])` and `removeGroup(ids[])` must be single store mutations (one persist write, one reconcile bump), per the S1 batching rule. Do NOT iterate `toggle(id)` per item.
- *`paint-toggle` in `interpretClick`?* No. Paint-toggle bypasses the rule table entirely — it's a per-cell-entry callback, not a click. Going through interpretClick would force adding a "drag mode" flag to its inputs and pollute the rule table. Direct dispatch is cleaner.

### Test surface

- **Vitest, `useLongPress.test.ts`:** threshold timing (advance fake timers); cancel on movement > tolerance; cancel on scroll; tap fires on quick release; long-press-then-tap (no drag) fires `onLongPressTap`.
- **Vitest, `usePointerDrag.test.ts`:** entering each cell fires once; re-entering fires again; `pointerup` clears set; auto-scroll triggers when y in band, stops when out.
- **Vitest, `selection-store.test.ts` extensions:** `addGroup` / `removeGroup` are atomic (single persist write — assert the storage adapter is called once); reconcile generation bumps once; ensureMetadata called for uncached.
- **Playwright `e2e/local/selections-mobile.spec.ts` (NEW), `pointer: coarse` profile:**
  - Long-press selects + enters mode.
  - Drag forward across 3 cells selects all three.
  - Drag back across 2 of those deselects them (paint-toggle).
  - Drag over a cell that was selected before the gesture: deselects it.
  - Plain drag (no long-press) scrolls; no selection occurs.
  - Long-press anchor cell A, release; long-press cell B → range A..B selected (anchor-intent).
  - Tap on tickbox toggles single cell.
  - Tap on empty area in mode = no-op.
  - Auto-scroll engages when finger at viewport edge (assert scrollY changes).
  - StatusBar visible at bottom on coarse pointer in mode.
- **Manual on real iOS Safari** (call out to user; agent cannot run): smoke the above. Capture-related quirks are the highest leak risk.
- **Mandatory before declaring done:** `npm --prefix kupua run test:e2e` per workplan discipline. Warn user about port :3000 first.
- **Perf gate:** No new perf scenario in S5 (S0.5 harness covers). Verify `pointermove` rate stays at 60+ fps on low-end profile during a long drag — add a one-off jank measurement if developer tools show drops.

### Done state checklist

- [x] `useLongPress` + `usePointerDrag` hooks shipped + Vitest green.
- [x] `paint-toggle` effect type added; `dispatchClickEffects` handles it.
- [x] `addGroup` / `removeGroup` selection-store actions + tests.
- [x] Grid + Table cells carry `data-cell-id`; container manages `touch-action` toggle.
- [x] Long-press-then-long-press path routes to existing `useRangeSelection` (anchor-intent range).
- [x] StatusBar bottom-sheet styling on coarse pointer in mode.
- [x] Mobile Playwright spec green (Pixel 5 emulation via devices['Pixel 5']).
- [ ] iOS Safari real-device smoke confirmed by user. (agent cannot run; call out to user)
- [x] Existing desktop selections specs still green (no regression). 221 desktop tests pass.
- [x] `worklog-current.md` captures decisions; AGENTS.md gets `useLongPress` + `usePointerDrag` rows in component summary.

---

---

## ✅ Phase S6 — Selection lifecycle: clear-on-search + hydration polish — DONE (3 May 2026)

> Was S3b ("persistence-survives-search UX"). Reframed 2026-05-03 after the
> shopping-cart analogy was rejected for v1: clipboard semantics belong to a
> future Clipboard component (My Places), not to the underlying selection set.
> The default-OFF flag preserves "survives everything" as a one-flip escape
> hatch but ships behaviour the user actually wants out of the box.

**Pre-flight context (verified in code, 2026-05-03):**

What already works — do NOT rebuild:

- `persist` middleware in [`selection-store.ts`](../../src/stores/selection-store.ts) writes `selectedIds` (as `string[]`) and `anchorId` to sessionStorage and rehydrates on mount. **Selections already survive reload, navigation, search, browser back/forward — all of it.**
- `resetToHome()` in [`reset-to-home.ts`](../../src/lib/reset-to-home.ts) already calls `useSelectionStore.getState().clear()`. **Home logo done.**
- `URL_DISPLAY_KEYS = {image, density}` in [`search-params-schema.ts`](../../src/lib/search-params-schema.ts). Changes to these bypass `search()` in `useUrlSearchSync` (the dedup compares non-display keys only). **Image detail open/close and density toggle naturally don't trigger search → naturally don't clear selection. Zero work needed.**
- `useUrlSearchSync` already computes `isPopstate`, `isUserInitiated`, `isSortOnly`, and first-mount (`_prevParamsSerialized === ""`). The clear-on-search hook drops in cleanly with no new detection logic.

What's broken or missing:

- `selection-store.hydrate()` is defined but **never called in app code** (verified — only tests reference it). After reload the `selectedIds` Set repopulates from sessionStorage, but `metadataCache` is empty → multi-image panel shows all dashes until each item is re-toggled. S6 must wire `hydrate()` on mount. (S4 polish patched the count=1 case via a `FocusedImageMetadata` fallback that reads from another cache; that mitigation does NOT cover count≥2 because the multi-panel reconciles across items rather than rendering a single fallback record. Hydrating the cache is the actual fix and supersedes the count=1 patch — leave the patch in place, it's defence-in-depth.)
- No clear-on-search hook anywhere. Today, changing the query keeps the selection.
- No clear-on-ticker-click. The ticker `onClick` calls `reSearch()` directly (not via URL), so the clear-on-search URL hook wouldn't catch it even when added.

### Decisions (locked, 2026-05-03)

**Default-OFF flag = "selections clear on most navigation."** The flag name and sense:

```ts
// constants/tuning.ts
export const SELECTIONS_PERSIST_ACROSS_NAVIGATION = false;
```

When `false` (default): selections clear on the navigation surfaces listed below.
When `true`: selections survive everything (today's behaviour). One-line flip,
useful if/when Clipboard arrives and we revisit the model. **No UI for the flag.**

**Survival matrix (when flag is `false`):**

| Surface | Survives? | Mechanism |
|---|---|---|
| Sort change (`orderBy`) | YES | Existing `isSortOnly` detection in useUrlSearchSync; clear hook skips. |
| Page reload | YES | Existing persist middleware. |
| Image detail open/close | YES | `image` is a URL_DISPLAY_KEY → no search fires. |
| Density toggle (grid↔table, columns) | YES | `density` is a URL_DISPLAY_KEY → no search fires. |
| Tier mode change (buffer↔two-tier↔seek) | YES | Internal state, no URL change, no search. |
| Home logo | NO | Already wired via `resetToHome()`. |
| Any search (query, filter, date range, saved search, URL paste) | NO | New clear hook in useUrlSearchSync. |
| New-images ticker click | NO | New clear in StatusBar ticker `onClick`. |
| Browser back/forward | NO | New clear hook in useUrlSearchSync (covers popstate via `isPopstate`). |
| Login/logout / forced session change | NO | Different user context; sessionStorage is per-tab anyway. (No code needed.) |
| Bulk-action completion | (deferred) | Not in v1. GPhotos clears, Kahuna keeps. Decide when bulk lands. |

**Items disappearing from results mid-session** (background ingestion deletes a selected image): leave the ID in `selectedIds`. Reconciliation tolerates missing items in cache. Hydration drop only fires on cold start. No mid-session pruning.

### Build order

1. **Add the flag.** `SELECTIONS_PERSIST_ACROSS_NAVIGATION = false` in `constants/tuning.ts` with a doc comment explaining the rationale, the survival matrix, and "to revisit when Clipboard ships."

2. **Wire `selection.hydrate()` on mount.** Add a single `useEffect(() => { void useSelectionStore.getState().hydrate(); }, [])` in [`src/routes/search.tsx`](../../src/routes/search.tsx) (top-level, runs once per route mount). Mount order: persist middleware rehydrates `selectedIds` synchronously before mount; this effect kicks the metadata fetch on first paint. The first `useUrlSearchSync` search runs in parallel — that's fine, `getByIds` and `searchAfter` are independent ES requests. **No race risk because hydrate() does not mutate `selectedIds` except to drop missing-from-ES IDs.**

3. **Clear-on-search hook in `useUrlSearchSync`.** Inside the existing URL effect, after `isSortOnly` is computed and BEFORE `setPrevParamsSerialized` (so first-mount-detection still works):
   ```ts
   const isFirstMount = _prevParamsSerialized === "";
   const isUrlNavigation = !isFirstMount && !isSortOnly;
   if (isUrlNavigation && !SELECTIONS_PERSIST_ACROSS_NAVIGATION) {
     useSelectionStore.getState().clear();
   }
   ```
   This single hook covers: query change, filter change, date-range change, saved-search click, manual URL paste, AND browser back/forward (both flow through this effect). Sort-only changes pass `isSortOnly === true` and are skipped. First mount (reload) is excluded.

4. **Clear-on-ticker-click.** In [`StatusBar.tsx`](../../src/components/StatusBar.tsx) ticker `onClick`:
   ```ts
   onClick={() => {
     resetScrollAndFocusSearch();
     if (!SELECTIONS_PERSIST_ACROSS_NAVIGATION) {
       useSelectionStore.getState().clear();
     }
     reSearch();
   }}
   ```
   Order matters: clear before `reSearch()` so the multi-panel doesn't briefly render reconciled state for the OLD selection against the NEW results. Selection-store's `clear()` is sync; reSearch() is async — clear lands first.

5. **Hydration drop toast.** Modify `selection-store.hydrate()` to fire a toast when missing IDs are found. Use the imperative `addToast()` export from S2.5 (selection-store can't use the React hook). Wording draft:
   > **"N items from your previous selection are no longer available."**
   (One line, no apology, no instructions. Toast category: `information`. Default lifespan.)
   Dedupe via a `_hydrationToastShown` boolean flag in the store, set to `true` after fire and reset on `clear()`. Prevents double-fire if hydrate() is called twice (shouldn't happen with the route-level mount, but cheap insurance).

### Out of scope for S6 (explicitly deferred)

- **`inViewCount` selector and drift status-bar text** (`12 selected · 8 in view`). Only meaningful under shopping-cart semantics; with default-OFF flag, selection always equals in-view (clamped to current results) so the split would always read identical. **Build when Clipboard arrives** — that's when the drift becomes a real signal. Adding it then is ~30 lines + a status-bar branch.
- **`SELECTIONS_PERSIST_ACROSS_NAVIGATION = true` UX polish.** When the flag is flipped, drift exists but goes uncommunicated. That's acceptable for an escape hatch — anyone flipping a tuning constant is a developer who knows what they're getting. If/when this becomes user-facing, S6.5 wires the drift UI.
- **Show-only-selected filter** (S7). Independent.
- **Mid-session pruning of items deleted from ES.** Reconciliation handles missing-from-cache gracefully; no need to surgically remove. Re-evaluate if user complains about phantom selections after long sessions.

### Files touched

- `kupua/src/constants/tuning.ts`: add `SELECTIONS_PERSIST_ACROSS_NAVIGATION` constant + doc comment.
- `kupua/src/routes/search.tsx`: add the one-line `useEffect` calling `selection.hydrate()`.
- `kupua/src/hooks/useUrlSearchSync.ts`: add the clear-on-search block (~5 lines).
- `kupua/src/components/StatusBar.tsx`: add clear in ticker `onClick` (~3 lines).
- `kupua/src/stores/selection-store.ts`: extend `hydrate()` to fire toast + dedupe via `_hydrationToastShown`. Reset flag in `clear()`.

### Test surface

- **Vitest, `selection-store.test.ts` extensions:** `hydrate()` fires toast exactly once when missing IDs found; doesn't fire when none missing; `clear()` resets the dedupe flag; second `hydrate()` call without intervening `clear()` is silent.
- **Playwright, `e2e/local/selections.spec.ts` extensions:**
  - Select 3 items → change query → selection clears (count goes to 0).
  - Select 3 items → change sort → selection survives (count stays at 3, multi-panel still rendered).
  - Select 3 items → reload → selection survives, multi-panel renders correctly (validates hydrate wiring populates metadataCache).
  - Select 3 items → open image detail → close → selection survives.
  - Select 3 items → toggle density grid↔table → selection survives.
  - Select 3 items → click ticker (mock newCount > 0) → selection clears.
  - Select 3 items → browser back → selection clears.
  - Toggle `SELECTIONS_PERSIST_ACROSS_NAVIGATION = true` (test-time) → all the above "clear" cases preserve instead. (One round-trip is enough; the flag is a single gate.)
- **Mandatory before declaring done:** `npm --prefix kupua run test:e2e` per the workplan discipline rule. Warn user about port :3000 first.

### Done state checklist

- [x] `SELECTIONS_PERSIST_ACROSS_NAVIGATION` constant lands in tuning.ts with comment.
- [x] `selection.hydrate()` called on `/search` route mount; reload populates metadataCache.
- [x] Clear-on-search hook in `useUrlSearchSync` (gated on flag, skips sort-only and first-mount).
- [x] Clear in ticker `onClick` (gated on flag).
- [x] Hydration drop toast fires once when missing IDs detected; deduped via store flag.
- [x] Vitest green (626 tests); Playwright e2e green (230 tests, 7 new S6 specs).
- [x] `toast-store.ts` bare `window` reference guarded with `typeof window !== "undefined"` (pre-existing bug exposed by importing toast-store in a Node-env test).
- [x] AGENTS.md updated if any new constant or behavioural surface is worth flagging (probably not — no new component).

### Implementation notes (gotchas)

- *Don't read the flag at module top-level.* Read inside callbacks/effects. Otherwise tests can't `vi.stubEnv` or override it. Keep it as a plain `const` import; if test-time override is needed, expose via `import.meta.env` similar to `RANGE_HARD_CAP` (S0 precedent).
- *`hydrate()` race vs first search.* The first `search()` may complete before `getByIds` does. That's fine — search-store and selection-store are independent. If the user immediately interacts with a selected item before metadata arrives, the multi-panel renders pending state for ~100ms. Acceptable.
- *Ticker order of operations.* Clear MUST happen before `reSearch()`, not after. If reSearch fires first, the old selection's reconciled view briefly renders against the new results (visual flicker; harmless but ugly).
- *`useUrlSearchSync` clear placement.* Place the clear AFTER `isSortOnly` is computed but BEFORE the `setPrevParamsSerialized` line — both branches (popstate and user-initiated) flow through the same effect, so one placement covers both.
- *`isUserInitiated` is consumed by `consumeUserInitiatedFlag()`.* Don't read it twice. The existing code already consumes it; the clear hook should use the existing variable, not call consume again.
- *Sort-only relaxation interaction.* The `isSortOnly` detection requires `_prevParamsSerialized !== ""` (not first search). Same condition we want for the clear (skip first-mount). Reuse: `const isUrlNavigation = _prevParamsSerialized !== "" && !isSortOnly;`.
- *Toast stacking.* If hydrate fires the toast and then the user immediately triggers another action that emits a toast (e.g. range select with hard-cap), both should stack via the existing `useToast` queue. No new work — verify with one Playwright assertion.
- *Future Clipboard hook.* When Clipboard ships, the model becomes: Clipboard owns durable persistence; selection stays ephemeral (current S6 behaviour). The `SELECTIONS_PERSIST_ACROSS_NAVIGATION` flag becomes obsolete and can be removed at that point. Note this in the constant's doc comment so a future agent finds it.

---

## Phase S7 (optional, defer-able) — Show-only-selected filter + perf hardening (~½ session)

> Was S6. Renumbered after former S3b moved to S6.


**Deliverable:** "Show only selected" toggle filters results to `id:(...)` query. Perf measurements documented.

- Filter chip in toolbar.
- Perf measurement run (new perf scenario `e2e-perf/selection-stress.spec.ts`).
- Document where it kneels and why; backlog any P-class perf work.

Optional because the hard need is selection itself, not the filter; but the filter is a 30-line addition once everything else works.

---

## Open questions — all closed

1. ~~Status bar phrasing~~ — **Closed (revised 2026-05-03):** `12 selected` always. The drift split (`· 8 in view`) is deferred — under the default-OFF `SELECTIONS_PERSIST_ACROSS_NAVIGATION` flag, drift cannot accumulate (selections clear on any non-sort search), so the split would always read identical. Build the drift UI when Clipboard arrives and the persistence model genuinely diverges.
2. ~~Toast infrastructure~~ — **Closed:** Strategy B (small reusable). Built in Phase S2.5.
3. ~~Confirmation dialog~~ — **Closed:** Not built in v1. Soft-cap is informational toast only. `useConfirm()` deferred to Phase 3+ when destructive operations land.
4. ~~Esc in Selection Mode~~ — **Closed:** does nothing.
5. ~~Tickbox click on focused image~~ — **Closed:** focus visually suppressed in Selection Mode but retained in memory (phantom-focus-style). Arrow keys behave as in unfocused state. See architecture §12.
6. ~~Per-field multiSelectBehaviour classification~~ — **Closed:** see [`field-catalogue.md`](field-catalogue.md). 46 fields catalogued; 37 implemented in Kupua today (the rest are missing-from-Kupua and explicitly out of scope for S4 — see S4 "Out of scope" list). Drops directly into S4 implementation.
