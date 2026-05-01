# Selections — Architecture

> Permanent reference for how multi-image selection works in Kupua and why it
> looks the way it does. Phase 2 work; editing actions deferred to Phase 3+.
> Implementation tracker (phases, gotchas, test surfaces) lives in
> [`../selections-workplan.md`](../selections-workplan.md).
>
> Companion docs:
> - [`../01 Research/selections-kahuna-findings.md`](../01%20Research/selections-kahuna-findings.md) — what Kahuna does and why it breaks above ~500 items.
> - [`../selections-field-classification.md`](../selections-field-classification.md) — per-field reconciliation table.

---

## 1. Goals (and explicit non-goals)

**Goals**

- Persistent multi-image selection that survives **sort changes** (mandatory) and **search changes** (best-effort, per Kupua's "100% in code, relax as conscious UX decision" philosophy).
- Comfortable interactive performance to **5,000 selected items** (10× Kahuna's ceiling). Larger should degrade gracefully, not crash.
- Reconciled metadata display in the right-hand Details panel — "all the same" shows the value, "differ" shows a "Multiple values" indicator. Field-by-field, mirroring Kahuna's information architecture but with non-quadratic cost.
- Designed as a **modal Selection Mode** (Kahuna-style) — but with the option to retire that modality later (Lightroom-style "selection is just a thing the app always knows about") without rewriting the data layer.
- A range-selection (shift-click) algorithm that **never silently drops items** between anchor and target — explicitly fixes the most-cited Kahuna bug.

**Non-goals (Phase 2)**

- Editing of metadata across selected items. The action toolbar remains read-only-ish (download/share entry points may land later in Phase 2; bulk edits are Phase 3+).
- Cmd/Ctrl-A "select all" — physically impossible at multi-million scale and dangerous. Will not be wired even where small result sets make it tempting.
- Selection markers on the Scrubber — deferred (UX call: cherry-on-top).
- Drag-and-drop interop with kahuna's MIME schema — flagged for Phase 3+ (Composer, Pinboard, etc. integration).

## 2. Selection Mode — modal, but not load-bearing modal

Kupua enters Selection Mode the moment `selectionCount > 0` and exits the moment it returns to 0. There is no explicit "Select" toggle button in the toolbar. Mode entry is implicit from the first tickbox click (desktop) or first long-press (touch).

Why modal?
- Click semantics need to differ between "browsing" and "selecting" — in selecting mode, clicking the image body toggles, not opens.
- A non-modal design (selection always tickable, click always opens) requires either a permanent tickbox column (visual cost) or a separate select-tool toggle (an extra mode by another name).

Why "not load-bearing"? The modal/non-modal distinction lives **only in the click-handler interpretation function** (§5). Everything else — the store, the reconciler, the persistence — works identically either way. If we ever want to switch to Lightroom-style always-on selection, it's a one-function change.

## 3. State shape

A new `selection-store.ts` (Zustand, ~150 lines), separate from `search-store.ts`.

```ts
interface SelectionState {
  // --- core ---
  selectedIds: Set<string>;                // sacred. Never auto-pruned.
  anchorId: string | null;                 // sticky anchor for shift-click ranges.

  // --- reconciliation accelerator ---
  metadataCache: Map<string, Image>;       // LRU, cap ~5000.
  pendingFetchIds: Set<string>;            // dedupe in-flight mget batches.

  // --- derived (memoised) ---
  reconciledView: ReconciledView | null;   // invalidated on selectedIds change.

  // --- actions ---
  toggle(id: string): void;
  add(ids: string[]): void;                // also covers single-add. Auto-calls ensureMetadata(ids).
  remove(ids: string[]): void;             // also covers single-remove
  clear(): void;
  setAnchor(id: string | null): void;      // Auto-calls ensureMetadata([id]) when id non-null.
  ensureMetadata(ids: string[]): Promise<void>;  // batched mget
  hydrate(): void;                         // sessionStorage → state on mount
}

interface ReconciledView {
  // For each field id (per field-registry), the reconciled state.
  fields: Map<string, FieldReconciliation>;
}

type FieldReconciliation =
  | { kind: "all-same"; value: unknown }
  | { kind: "all-empty" }
  | { kind: "mixed"; sampleValues: unknown[]; emptyCount: number; valueCount: number };
```

**Storage choices and why:**
- `Set<string>` for `selectedIds`: O(1) membership, O(1) toggle, well-suited to persist as `Array.from(set)`. Avoids `Immutable.OrderedSet` (Kahuna's choice) — we don't need insertion-order preservation; the anchor is explicit.
- IDs only, no payloads in the set. Payloads live in the `metadataCache` LRU and the regular search-store buffer — the set is the source of truth for *what is selected*, never *what the data looks like*.
- `Map<string, Image>` LRU for metadata: cap 5000. Most reconciliation work happens against the in-buffer items + cache; only a tail of items needs network fetch.
- `pendingFetchIds`: prevents thundering-herd when reconciliation is requested twice in quick succession (e.g. add 500 items via shift-click then user pans the details panel).

**Cohesion rules** (load-bearing — picked up via S3a rehearsal):
- `setAnchor(id)` MUST call `ensureMetadata([id])`. Range-select's server-walk path needs the anchor's sort values; without this, every server-walk eats an extra round trip.
- `add(ids[])` MUST call `ensureMetadata(ids)`. Reconciliation cannot run on uncached items; we want range-add to surface the metadata fetch as part of the action, not as a downstream surprise.

## 4. Persistence — survives reload, drops missing items silently

Wired via `zustand/middleware` `persist`, matching the established pattern (`column-store`, `panel-store`, `ui-prefs-store`).

- `partialize`: persist only `selectedIds` and `anchorId`. The metadata cache is rebuilt on demand; `pendingFetchIds` and `reconciledView` are runtime-only.
- Storage: `sessionStorage`. Survives reload within a tab. Does not leak across tabs (matches selection mental model — selection is "what I'm working on right now").
- **Hydration drift handling:** on mount, `selectionCount > 0` triggers a single batched `getByIds(selectedIds)` call. IDs that ES returns nothing for are silently removed from the set. A one-time toast announces `"N selections from your last session were no longer available and have been dropped."` if any drift occurred.
- **Cap:** if persisted set exceeds 5,000 items on hydration, log a warning and truncate to the most-recently-added 5,000. This is a defensive guard, not an expected path.

**Why sessionStorage not localStorage:** selections are work-in-progress, not preferences. A second tab on the same Grid should not inherit the first tab's working selection — that's a recipe for confusion when bulk-edit lands in Phase 3+.

**Why not URL:** physically impossible above ~50 items (URL length); also conceptually wrong (URL is for shareable state, selection is private working state).

## 5. Click semantics — one pure function, three rules

All click handlers in `ImageGrid` and `ImageTable` delegate to a single pure function:

```ts
type ClickKind = "tick" | "image-body";
type Modifier = "none" | "shift" | "meta-or-ctrl";

interface ClickContext {
  targetId: string;
  kind: ClickKind;
  modifier: Modifier;
  inSelectionMode: boolean;        // = selectedIds.size > 0
  anchorId: string | null;
  // For range-resolution. May be undefined when target/anchor is out-of-buffer.
  // Anchor undefined → effect carries null in anchorGlobalIndex; hook resolves
  // via positionMap or via a searchAfter({ ids: anchorId }) fallback.
  targetGlobalIndex: number | undefined;
  anchorGlobalIndex: number | undefined;
  // Optional sort cursors, sourced by the caller from metadataCache /
  // results buffer when available. Hook resolves nulls itself.
  targetSortValues: SortValues | null;
  anchorSortValues: SortValues | null;
}

type ClickEffect =
  | { op: "open-detail"; id: string }
  | { op: "set-focus"; id: string | null }
  | { op: "toggle"; id: string }
  | { op: "set-anchor"; id: string }
  | {
      op: "add-range";
      anchorId: string;
      anchorGlobalIndex: number | null;       // null = evicted / unknown
      anchorSortValues: SortValues | null;    // null = caller didn't have it; hook resolves
      targetId: string;
      targetGlobalIndex: number;              // always available — user just clicked it
      targetSortValues: SortValues;           // always available from the clicked image
    };

function interpretClick(ctx: ClickContext): ClickEffect[];
```

**On the `add-range` effect shape.** The earlier draft used raw `fromIndex` / `toIndex` numbers and a `viaServer` flag. That couldn't represent "anchor is evicted, I don't know its index" — `fromIndex: 0` was indistinguishable from "anchor is at position 0". Carrying IDs (always known) plus a nullable global index plus optional sort cursors lets the range hook decide in-buffer vs server-walk itself, without the click interpreter needing to know about `bufferOffset` or two-tier mode. See the S3a workplan entry for the resolution algorithm.

**Rule table** (this is the contract — change it deliberately, with new tests):

| Mode | Target | Modifier | Effects |
|---|---|---|---|
| Not in Selection Mode | image body | none | `set-focus(id)` then (in click-to-open mode) `open-detail(id)` — current behaviour, untouched |
| Not in Selection Mode | tick | any | `set-anchor(id)`, `toggle(id)` — enters Selection Mode |
| In Selection Mode | image body | none | `toggle(id)` (does NOT open detail, does NOT change focus) |
| In Selection Mode | image body | shift | If `anchorId` set: `add-range{...}` — anchor unchanged. If not: `set-anchor(id)`, `toggle(id)` |
| In Selection Mode | tick | none | Same as image-body none |
| In Selection Mode | tick | shift | Same as image-body shift |
| Any | any | meta/ctrl | Reserved — currently no-op. Future: secondary selection set / paste. |

**Anchor rule (Rule 2 from the UX call):** non-shift selection click sets the anchor. Shift-click expands without moving the anchor. A separate `set-anchor` gesture is not provided in v1 — the user re-anchors by non-shift-clicking elsewhere.

**Why this shape is easy to refine:** the entire interaction policy lives in one pure function with a small fixed input/output contract. Rule changes are: (a) edit the table, (b) edit the function, (c) update tests. UI components stay untouched. Renaming "Selection Mode" away to non-modal is similarly local — it's just one flag in `ClickContext` becoming always-true.

**On deselect-range:** intentionally not a modifier in v1. Users will not understand `Shift+Cmd-click excludes range`. If repeated requests for it appear, add a "Deselect range" affordance in the toolbar (button activates a one-shot mode where the next shift-click deselects instead of selects). Not designed now.

## 6. Range selection — never silently drop

Kahuna's bug was that range expansion was bounded by *loaded-and-rendered images*. We won't repeat it. Two paths:

**In-buffer fast path.** When both anchor and target are inside the current windowed buffer (`bufferOffset ≤ idx < bufferOffset + results.length`), resolve the range from `results[]` directly. No network, microsecond cost. This is the common case at <1k results and the typical case for adjacent shift-clicks.

**Server-walk path.** When either end is outside the buffer (or both are), call new DAL method `getIdRange(params, fromCursor, toCursor, signal?)` which walks `search_after` between two cursors with `_source: false`. Returns the full ID list with a `truncated: boolean` flag.

- **Hard cap:** 5,000 IDs per `getIdRange` walk. Beyond that, the call returns truncated and the UI shows: `"Range too large — selecting first 5,000 items. Use a narrower search to refine."` (no silent truncation).
- **Soft cap:** at 2,000 IDs the action proceeds without prompting, but an informational toast announces the size: `"Added 2,400 items to your selection."` No Yes/No — adding to a selection is non-destructive and trivially reversible (Clear, or single-tick toggle). Avoids interrupting the user with a modal in v1. Numbers come from the position-map delta when available; otherwise from the post-fetch result. (Confirm dialogs are deferred to Phase 3+ when actually destructive operations exist.)
- **Cancellation:** the walk takes an `AbortSignal`; subsequent shift-clicks abort prior walks.

**On position-map availability:** in two-tier mode (1k–65k) we have a position map and can compute exact range size *before* the network call — useful for the soft-cap toast wording. In seek mode (>65k) we only know the count post-fetch; the toast fires then. In normal mode (<1k) we're always in-buffer fast path.

## 7. Reconciliation — lazy, incremental, bounded

The naive approach (Kahuna's) is O(N² × F) per toggle. We need O(F) per toggle for typical add/remove operations, and we need range adds of thousands of items to NOT block the main thread.

**Algorithm:**

The reconciled view is a `Map<fieldId, FieldReconciliation>`. For each field, the reconciliation state holds:
- `kind: "all-same" | "all-empty" | "mixed" | "pending"`
- For "all-same": the agreed value.
- For "mixed": three numbers — `valueCount` (items with non-empty value), `emptyCount` (items with empty value), and a small `sampleValues` array (cap 3, for tooltip "e.g. Reuters, AP, Getty").
- For "pending": the field's reconciled value isn't computed yet (range add not yet processed, or metadata still loading). The panel renders a per-field placeholder (subtle dash) in the value slot, label intact — NO panel-wide "Loading reconciled view…" overlay.

**Incremental update on `toggle(id)`:** synchronous, O(F).

1. If image's metadata is in the cache, compute the per-field delta immediately:
   - On add: if currently "all-empty" and value is non-empty → "all-same" with this value. If currently "all-same" and the new value differs → "mixed". If currently "mixed" → bump counts.
   - On remove: requires more care — we don't know if the removed value was unique without re-scanning. **Decision: on remove, mark the field's reconciliation as "dirty" and recompute lazily on next read.** Recompute is O(N × F') where F' is dirty fields. Removals that don't change the reconciliation outcome (the common case) cost nothing visible.
2. If image's metadata is NOT in the cache, mark all reconcile fields as "pending" for this id, queue an `ensureMetadata` call; when it resolves, run the per-field delta. The panel keeps rendering its previous reconciled state with placeholders only on fields where it would otherwise lie.

**`add(ids[])` (range adds, bulk hydration) is LAZY:** does NOT block on reconciliation.

1. The store flips reconciled fields' status to "pending" immediately (cheap state mutation).
2. The Details panel renders the per-field placeholder in the value slot for any pending field. Label stays. No panel-wide loading state.
3. In a `requestIdleCallback` (or `setTimeout 0` fallback) chunk, the reconciler processes the new IDs in batches (e.g. 500 per chunk), folding into the existing `FieldReconciliation` state. After each chunk, the store generation counter bumps; the panel renders incrementally.
4. Subsequent `add()` calls that arrive mid-recompute extend the work queue; the reconciler picks them up at the next chunk boundary. No invalidate-and-restart.

`clear()` is O(1) — just resets the map. Cheap.

**Why lazy:** a synchronous full recompute on a 5k range add is 50–150ms of main-thread block (3–9 dropped frames at 60Hz) right after the toast confirms the action. Lazy spreads the work across frames; the placeholder dashes are momentary on a fast machine and informative on a slow one. The panel never blocks the click handler.

**Why per-field placeholders, not a panel-wide loading state:** a panel-wide overlay flashes on every range add and is jarring. Per-field dashes are unobtrusive; the visible label list stays stable. Exact placeholder visual is TBD on first sight — leave it tweakable.

**Cost envelope (revised):**
- Single toggle (add, cached): O(F) synchronous — ~25 fields, ~25 accessor calls. Sub-millisecond.
- Single toggle (remove, no dirty fields): O(F) marking, no recompute. Sub-millisecond.
- Range add of 2,000 items: chunked across ~4 idle frames at 500 per chunk. Each chunk ~5–10ms. Panel updates incrementally; no main-thread block.
- Worst case 5,000 items: ~10 chunks, ~50–100ms total wall-clock, zero frames blocked. User sees placeholders briefly on slow devices.

**Memoisation key:** the `reconciledView` is invalidated by a generation counter bumped on any selectedIds mutation AND on each chunk completion during lazy recompute. No structural diffing.

## 8. What gets reconciled, what doesn't

Mirroring Kahuna's structural rule — fields that don't make sense across multiple images are simply not rendered in multi-select.

The field registry will gain a new optional flag: `multiSelectBehaviour?: "reconcile" | "always-suppress" | "show-if-all-same"`.

- `reconcile` (default for editable text fields): runs full reconciliation, shows value or "Multiple values".
- `always-suppress`: never shown in multi-select (id, fileName, dimensions, uploadedBy, uploadTime, identifiers).
- `show-if-all-same`: shown only when all selected items agree (e.g. fileType — "12 selected items, all JPEG" is useful; "Multiple file types" is less so). Otherwise hidden.

**"Important empty fields" parity with Kahuna.** Kahuna's behaviour is structural: certain fields (title, description, special instructions, date taken, credit) render even when all selected items are empty, signalling "these matter, here is where you'd add them". Phase 2 has no editing, so this signalling is currently informational only — but the field registry should already mark these fields as `showWhenEmpty: true` so the Phase-3+ edit affordance lands cleanly.

**Array fields (keywords, subjects, people).** Kahuna does no reconciliation — it shows the union of all chips with per-chip remove. We do the same in v1 (no semantic reconciliation), but we **compute and display occurrence counts** as small badges (`Reuters ×12`) so users can tell which keywords are common across the selection. This is a cheap improvement on Kahuna and a useful signal pre-edit.

**Per-field classification — see [`../selections-field-classification.md`](../selections-field-classification.md)** for the full table mapping each of Kupua's 33 fields (26 hardcoded + 7 default config aliases) to `multiSelectBehaviour` + `showWhenEmpty`. Summary: 23 reconcile, 8 always-suppress, 2 show-if-all-same; 6 fields marked `showWhenEmpty: true` (title, description, specialInstructions, byline, credit, dateTaken) per Kahuna's important-empty signal.

**Notable deviations from Kahuna's per-field behaviour** (logged in `../deviations.md`):
- **All config alias fields reconcile** (Kahuna suppresses them entirely in multi-select). Cheap, more useful, particularly valuable for `digitalSourceType` where mixed human/AI is editorially significant. `FieldAlias` may later gain optional per-field overrides if a Grid operator needs them — not built until concrete need.
- **`source_mimeType` show-if-all-same** (Kahuna suppresses). "All 47 are JPEG" is useful confirmation; mixed is hidden as noise.
- **`metadata_suppliersReference` and `metadata_bylineTitle` reconcile** (Kahuna suppresses by single-image gate). Promoted by analogy to byline/shoot-code semantics.

## 9. Drift handling — selection vs search results

A user selects 50 items, then changes the search; only 12 of those 50 match the new query.

**Behaviour:**
- The 50 stay in `selectedIds`. The set is sacred.
- The status bar shows: `"50 selected · 12 in current view"`. (Format: TBD on review; alternative `"50 (12 here)"`.)
- The Details panel shows reconciliation across **all 50**, not just the 12. (Argument: selection-as-shopping-cart — what you're working on stays consistent regardless of where you're browsing.)
- A small "Show only selected" toggle in the toolbar (Phase 2 nice-to-have, can defer to v2) lets the user filter the results to just their selection — implemented as a filter chip `id:(id1 OR id2 OR …)`.

When the user navigates back to a query containing more of the selected items, the selection is still there. Persistence is the *whole point*.

**On items deleted from ES:** silent drop on next batch fetch (e.g. on hydration or on first reconciliation). Toast as in §4.

## 10. Touch / mobile

Per UX call: GPhotos-style.

- **Long-press** (default 500ms; tunable in `constants/tuning.ts`) on any cell enters Selection Mode and toggles that cell.
- **Drag during long-press** (a continuous gesture from the entered selection) extends the range as the finger moves over cells. Cells lit by the finger are added (never removed during drag).
- **Tap** in Selection Mode toggles, same as desktop click.
- **No tickbox visible until Selection Mode is active**, then visible on every cell (no hover concept on touch).
- **Long-press a tick to exit Selection Mode?** No. Only the toolbar Clear button exits.
- **No swipe gestures on cells** — those are reserved for image detail (carousel/dismiss).

The long-press detection lives in a new `useLongPress.ts` hook, paired with `usePointerDrag.ts` for the drag-extend. Both reuse the existing `pointer: coarse` detection in `ui-prefs-store.ts` — long-press is **only active on coarse pointers** to avoid accidental fires from slow mouse clicks.

## 11. Toolbar — "Selection Status Bar"

A new component `SelectionStatusBar.tsx`, rendered in `SearchBar` (or wherever the existing toolbar groups land), visible only when `selectionCount > 0`.

**Content (left to right):**
1. Count chip: `12 selected` always; `12 selected · 8 in view` only when result-set drift exists (selected items not all in current results). The chip is visually static-width-friendly but no fixed-width reservation in v1 — a small layout shift when drift appears is acceptable.
2. **Clear** button (always visible in Selection Mode — primary exit affordance).
3. Action slots — empty in v1. Placeholder for Phase 3+ download/share/edit/archive.

**Selections-survive-search escape hatch.** The "survives search" behaviour (§9) is the convoluted bit — reconciling across items not in the current view, showing the drift counter, etc. It must be **easy to switch off** if it proves more confusing than useful. Implementation: a single boolean constant `SELECTIONS_SURVIVE_SEARCH` in `constants/tuning.ts`. When false: `search()` (the orchestration kind, not extends/seeks) calls `selection.clear()` before issuing. The status bar reverts to plain `12 selected` (no drift line ever). The reconciler only ever sees in-view items. No other code paths change. Default: true; flip to false if user testing rejects the survive-search model.

The bar replaces nothing; it appears in the toolbar area and pushes other items right (or wraps on narrow widths). Mobile: the bar slides up from the bottom (sheet-style) and contains only the count and Clear, plus a hamburger for future actions.

## 12. Details panel — branching

When `selectionCount === 0`: show `<ImageMetadata image={focusedImage} />` (current behaviour, unchanged).

When `selectionCount > 0`: show `<MultiImageMetadata />` — a new component that:
- Reuses internal primitives from `ImageMetadata.tsx` (`MetadataSection`, `MetadataRow`, `MetadataBlock`, `FieldValue`) — these get extracted to a small `metadata-primitives.tsx` module. Low-risk refactor.
- Reads `reconciledView` from the selection store via memoised selectors.
- For each field: dispatches on `FieldReconciliation.kind`:
  - `all-same` → renders the value with the same `FieldValue` component used in single-image view.
  - `all-empty` → shown only for `showWhenEmpty: true` fields, with subtle "—" placeholder.
  - `mixed` → renders a `MultiValue` component (new): displays "Multiple values" plus, on hover/tap, a small popover with the sample values + counts.

The focused image, if any, is **suspended** in multi-select mode — its single-image metadata is not shown. Rationale: the panel is one surface; we shouldn't double up. (Alternative considered: split panel with both views. Rejected as visually noisy and confusing.)

When the user clears selection, the panel reverts to focused-image metadata.

**Focus during Selection Mode — visually gone, retained in memory.** When `selectionCount > 0`:
- The focus *ring* on cells is suppressed (`isFocused` derived state evaluates to false in Selection Mode for visual purposes).
- `focusedImageId` in the store is **not cleared** — machinery that needs an anchor (sort-around-focus, position preservation, history snapshots) keeps using it. This mirrors the phantom-focus pattern already used for click-to-open mode.
- Arrow keys move per-row in Selection Mode (existing keyboard navigation behaviour kicks in when no visible focus exists — this Just Works).
- Space key (S5+) toggles the cell at the current arrow-keyboard position. Shift+arrow (S5+) extends selection from anchor to the new arrow position.
- On exit from Selection Mode (count drops to 0), the (still-set) `focusedImageId` becomes visible again — user finds focus exactly where they left it.

This decision deliberately keeps the door closed on Lightroom-style non-modal selections in v1: a non-modal future would need focus and selection both visible simultaneously, which means revisiting this rule. Documented as a deviation from the always-on visual focus convention.

## 13. Phase 3+ extension points — what we're explicitly leaving room for

Spelled out so nothing in v1 paints us into a corner:

- **Bulk edit.** Each `FieldReconciliation` already carries enough information to drive an edit affordance (current value or "Multiple"). The Phase-3 edit pencil clicks into an input pre-filled with the agreed value (or blank if mixed), and saving calls `getByIds(...)` followed by a per-image batch update. The selection store stays unchanged; only the panel and a new edits service grow.
- **Drag-and-drop interop.** Kahuna's MIME schema (per audit Section 5) is the integration contract for Composer/Pinboard. When v1 drag-source is added, payload construction reads from `selectedIds` + `metadataCache`. Selection store unchanged.
- **Action toolbar fill-in.** The empty action slots in `SelectionStatusBar` accept registered action components. Each action declares which selection sizes it supports (e.g. delete might cap at 100 for safety; share-via-URL caps at 44 like Kahuna).
- **Lightroom-style non-modal.** One flag in `ClickContext` becomes always-true; the click table simplifies. Tickbox always visible (or Select toggle in toolbar). No data-layer change.
- **Selection markers on Scrubber.** Selection store's `selectedIds` is already O(1) lookup. Scrubber renders one tick per selected position when its position is known via the position map. Cheap to add later.
- **Cache staleness on external edits.** Phase 2 is read-only so the metadata cache is always current within a tab. In Phase 3+, when other tabs / kahuna sessions can edit images, cached entries can drift. Mitigations to consider then: TTL on cache entries (refetch any entry older than ~60s before it feeds reconciliation), version field comparison against ES, refetch on window-focus event. Not designed in v1.
- **Cursor-pair shorthand for pure ranges.** When selection consists of *only* a single shift-click range with no individual ticks/unticks on top, it's expressible as `{ kind: "range", anchorCursor, targetCursor, params }` rather than as N materialised IDs. Re-materialise lazily when needed. Useful only if memory or sessionStorage pressure becomes real — `// FUTURE:` marker, not built in v1.
- **Confirm dialogs for destructive operations.** When bulk delete / bulk edit lands, the toast-only model breaks down — destructive operations need a confirmation step. `useConfirm()` follows the same Strategy-B pattern as `useToast()` (small, in-app, no external deps). Out of v1 scope; flagged here so the implementor doesn't reinvent.

## 14. Deviations from Grid/kahuna — to be logged

To be appended to `../deviations.md`:

- Selection persists across sort, search, and reload (Kahuna drops on every route change). Trade-off: more state to manage; mitigated by silent drop + toast on missing items.
- Shift-click range never silently drops items between anchor and target (Kahuna does, requiring users to scroll-load). Trade-off: server roundtrip in two-tier+; mitigated by hard cap (5k) and informational toast at soft cap (2k).
- No Cmd/Ctrl-A. Justified by multi-million scale.
- Anchor is sticky across shift-clicks (Kahuna's anchor is "last added URI", causing repeated shift-clicks to misbehave).
- Touch support via long-press and drag-extend (Kahuna has none).
- Stale metadata under external edits: acknowledged, deferred to Phase 3+ (Kahuna doesn't handle this either, but Kahuna's selection dies on route change so the window is small).
- Bulk operations on whole-search-result populations are explicitly NOT a selection-store concern (see §15).

## 15. Selections vs Operations — separate problems

A future feature, well outside v1 scope but worth flagging here so the boundary stays clean: **bulk operations on whole search results** (e.g. "apply this metadata change to all 28,000 images matching this query"). It must not be built on top of the selection store.

The distinction:

| Selection | Operation |
|---|---|
| "I have these N specific things, do something to *exactly them*." | "I have this query, do something to whatever matches it (now and possibly later)." |
| State = set of IDs in the frontend. | State = a query + an edit spec, sent to the backend. |
| Bounded to thousands. | Bounded to whatever ES can handle (millions). |
| IDs materialise on the client. | IDs never touch the client — server-side `Update By Query` (or Grid wrapper) does the work. |
| Progress UI: implicit (you see what you ticked). | Progress UI: explicit job tracking, dry-run preview, confirmation guards ("this will affect ~28,000 images, type the count to confirm"). |

The two share zero data layer. They may even live in different routes/modals. Keeping them separate also keeps the selection store from growing features (chunked progress, partial-failure recovery, server-side dry-run) that don't belong in client state.

The two interact in only one place worth designing for now: nothing. We do not provide a "convert this selection into an operation" gesture. Selection-as-a-shopping-cart and operation-as-a-query are distinct mental models, and offering to silently convert between them would confuse more than help. If a user wants to operate on a search result, they go to the operations UI and compose the query there.
