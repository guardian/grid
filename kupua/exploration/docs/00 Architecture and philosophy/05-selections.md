# Selections — Architecture

> Permanent reference for how multi-image selection works in Kupua and why it
> looks the way it does. Phase 2 work; editing actions deferred to Phase 3+.
> Implementation history (phases, gotchas, test surfaces) lives in the
> archived workplan at
> [`../zz Archive/selections-workplan.md`](../zz%20Archive/selections-workplan.md)
> and the per-phase narrative in [`../changelog.md`](../changelog.md).
>
> Companion docs:
> - [`../01 Research/selections-kahuna-findings.md`](../01%20Research/selections-kahuna-findings.md) — what Kahuna does and why it breaks above ~500 items.
> - [`field-catalogue.md`](field-catalogue.md) — per-field reference (multi-select behaviour, ES presence, Kupua/Kahuna parity).

---

## 1. Goals (and explicit non-goals)

**Goals**

- Multi-image selection that survives **sort/order changes**, **page reload** (within a tab), **image detail open/close**, **density change** (grid ↔ table, column count), and **tier-mode change**. Cleared on **any new search** (query, filter, saved-search, URL paste, ticker click, browser back/forward) and on the **Home logo**. The full survival matrix is in §4. A `SELECTIONS_PERSIST_ACROSS_NAVIGATION = false` constant in `constants/tuning.ts` is the one-line escape hatch back to "survives everything" for future Clipboard work.
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
  | { kind: "mixed"; sampleValues: unknown[]; emptyCount: number; valueCount: number }
  // Chip-array fields (keywords, people, labels, subjects). `count` per chip
  // drives the partial/full visual; `total` = selectedIds.size for the gate.
  | { kind: "chip-array"; chips: Array<{ value: unknown; count: number }>; total: number }
  // Summary-only fields (leases). Pre-rendered headline string; no per-record
  // reconciliation. Computed lazily from per-image lease arrays.
  | { kind: "summary"; line: string };
```

**Storage choices and why:**
- `Set<string>` for `selectedIds`: O(1) membership, O(1) toggle, well-suited to persist as `Array.from(set)`. Avoids `Immutable.OrderedSet` (Kahuna's choice) — we don't need insertion-order preservation; the anchor is explicit.
- IDs only, no payloads in the set. Payloads live in the `metadataCache` LRU and the regular search-store buffer — the set is the source of truth for *what is selected*, never *what the data looks like*.
- `Map<string, Image>` LRU for metadata: cap 5000. Most reconciliation work happens against the in-buffer items + cache; only a tail of items needs network fetch.
- `pendingFetchIds`: prevents thundering-herd when reconciliation is requested twice in quick succession (e.g. add 500 items via shift-click then user pans the details panel).

**Cohesion rules** (load-bearing — picked up via S3a rehearsal):
- `setAnchor(id)` MUST call `ensureMetadata([id])`. Range-select's server-walk path needs the anchor's sort values; without this, every server-walk eats an extra round trip.
- `add(ids[])` MUST call `ensureMetadata(ids)`. Reconciliation cannot run on uncached items; we want range-add to surface the metadata fetch as part of the action, not as a downstream surprise.

## 4. Persistence — survival matrix and hydration

Wired via `zustand/middleware` `persist`, matching the established pattern (`column-store`, `panel-store`, `ui-prefs-store`).

- `partialize`: persist only `selectedIds` and `anchorId`. The metadata cache is rebuilt on demand; `pendingFetchIds` and `reconciledView` are runtime-only.
- Storage: `sessionStorage`. Survives reload within a tab. Does not leak across tabs (matches selection mental model — selection is "what I'm working on right now").

### Survival matrix (default behaviour: `SELECTIONS_PERSIST_ACROSS_NAVIGATION = false`)

| Surface | Survives? | Mechanism |
|---|---|---|
| Sort change (`orderBy`) | YES | `useUrlSearchSync` detects sort-only via `isSortOnly`; clear hook skips. |
| Page reload | YES | persist middleware. Hydration repopulates `metadataCache` via `getByIds`. |
| Image detail open/close | YES | `image` is a `URL_DISPLAY_KEY`; no search fires. |
| Density toggle (grid↔table, column count) | YES | `density` is a `URL_DISPLAY_KEY`; no search fires. |
| Tier-mode change (buffer↔two-tier↔seek) | YES | Internal state; no URL change, no search. |
| Home logo | NO | `resetToHome()` calls `selection.clear()`. |
| Any new search (query, filter, date range, saved search, URL paste) | NO | `useUrlSearchSync` clear hook (gated on flag). |
| New-images ticker click | NO | `StatusBar` ticker `onClick` calls `clear()` before `reSearch()`. |
| Browser back / forward | NO | Same `useUrlSearchSync` clear hook (covers `isPopstate`). |
| Login/logout / forced session change | NO | sessionStorage is per-tab; new context starts clean. |
| Bulk-action completion | (deferred) | Phase 3+. GPhotos clears, Kahuna keeps; decide when bulk lands. |

**Items disappearing from results mid-session** (background ingestion deletes a selected image): the ID stays in `selectedIds`. Reconciliation tolerates missing items in the cache. Hydration drop only fires on cold start.

### Position preservation on sort changes

Selections surviving a sort change is necessary but not sufficient — without position preservation, the user's viewport resets to the top and they lose their place.

**Two cases, one pipeline:**

1. **User had explicit focus before entering Selection Mode.** `focusedImageId` persists in the store (visually suppressed but not cleared — see §12). On sort change, the existing sort-around-focus mechanism picks it up directly and preserves position around that image. No new code involved; this Just Works because focus is retained in memory.

2. **User entered Selection Mode without prior focus** (the common case — first interaction was a tickbox click, which sets the selection anchor but not focus). `focusedImageId === null`. Without intervention, the viewport would reset to top. A dedicated fallback bridges this gap: when a sort change fires and `focusPreserveId` would otherwise be `null`, `useUrlSearchSync` checks if `selectedIds.size > 0 && anchorId != null` and uses `anchorId` as the position-preservation target via the `phantomOnly` search path.

**Case 2 mechanism in detail:** Effect #7 in `useScrollEffects` saves the anchor image's viewport ratio before the search fires. After the search completes, `_findAndFocusImage` locates the anchor in the new sort order, sets `_phantomFocusImageId`, and bumps `sortAroundFocusGeneration`. Effect #9 restores the anchor at its saved viewport ratio.

**Key properties:**
- Priority chain on sort change: `focusedImageId` (case 1) > `selectionAnchorId` (case 2). If explicit focus exists, it wins; the selection anchor fallback is never reached.
- Case 2 never sets `focusedImageId` — entering selection mode with no focus, changing sort, and then clearing selection still leaves `focusedImageId` null (no surprise focus ring appears).
- Both cases use the same phantom-focus pipeline; case 2 just provides a different ID to it.
- Gated by `isSortOnly` / `sortOnly` — only fires on sort changes, independently of the persistence flag (see below).

**Files:** `useUrlSearchSync.ts` (§ sort-only fallback block), `useScrollEffects.ts` (Effect #7 `preserveId` line).

### Flag: `SELECTIONS_PERSIST_ACROSS_NAVIGATION`

Lives in `constants/tuning.ts`. Default `false`. When `true`, the four "NO" rows above flip to YES — selections survive everything (the original v1-design behaviour). Single-line escape hatch; no UI surface. Intended to be revisited when **Clipboard** (My Places) ships and durable persistence becomes the Clipboard's concern rather than the selection set's. At that point this flag becomes obsolete and is removed.

**Relationship to position preservation:** The flag controls whether selection *survives* a navigation — it has no effect on position preservation logic. Position preservation via the anchor fires **only on sort-only changes** regardless of flag state. With flag=true and a non-sort change (query, filter), the selection survives but position is handled by the viewport-anchor mechanism (existing phantom-focus path), not by the selection anchor. This is deliberate: on a query change the anchor image may not exist in the new results, making it an unreliable position target. Sort changes merely reorder the same result set, so the anchor is always findable.

### Hydration on mount

- `useSelectionStore.getState().hydrate()` called once from the `/search` route's mount effect. (The persist middleware repopulates `selectedIds` synchronously before mount; `hydrate()` is what kicks the metadata fetch so the multi-image panel renders reconciled values rather than dashes.)
- `hydrate()` calls `getByIds(selectedIds)`. IDs ES no longer returns are silently dropped from the set.
- A one-time **information toast** — *"N items from your previous selection are no longer available."* — fires when drift is detected. Deduped via a module-level flag, reset on `clear()`.
- **Cap:** if persisted set exceeds 5,000 items on hydration, log a warning and truncate to the most-recently-added 5,000 (defensive guard, not an expected path).

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
| In Selection Mode | image body | shift | If `anchorId` set: `add-range{polarity}` — anchor unchanged, polarity = anchor currently selected ? add : remove. If no anchor: `set-anchor(id)`, `toggle(id)` |
| In Selection Mode | tick | none | Same as image-body none |
| In Selection Mode | tick | shift | Same as image-body shift |
| Any | any | meta/ctrl | Reserved — currently no-op. Future: secondary selection set / paste. |

**Anchor rule:** non-shift selection click sets the anchor. Shift-click operates relative to the anchor without moving it. The user re-anchors by non-shift-clicking elsewhere.

**Polarity rule:** the anchor's current selection state determines whether the range adds or removes. The anchor is set by a non-shift click which also toggles it — so if the anchor is selected, the user was in an adding gesture → range adds. If the anchor is unselected, the user was in a removing gesture → range removes. Mixed ranges (some items already in the right state) are no-ops on those items.

**Why this shape is easy to refine:** the entire interaction policy lives in one pure function with a small fixed input/output contract. Rule changes are: (a) edit the table, (b) edit the function, (c) update tests. UI components stay untouched.

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

**Buffer images are metadata-complete.** `SOURCE_INCLUDES` in `es-config.ts` covers all three field tiers — Tier 1 (grid density), Tier 2 (table density), Tier 3 (detail panel) — including every field the reconciler reads: keywords, location sub-fields, mimeType, colour model, usageRights.category, and all fileMetadata sub-fields. Images in the search `results[]` buffer therefore carry complete panel metadata. The `ensureMetadata` / `getByIds` path is only *strictly necessary* for:
- Images rehydrated from sessionStorage (buffer is gone after reload).
- Images range-selected via server-walk that fell outside the buffer window.
- Images that have since scrolled out and been evicted from the buffer.

For interactive selection of visible images, `ensureMetadata` re-fetches data the buffer already contains. An optimisation — seeding `metadataCache` from `results[]` at toggle/add time — would eliminate those round-trips and remove pending-field flicker for common interactive selections. Not built in v1; `ensureMetadata` guards against duplicates (`pendingFetchIds` dedup), so the extra fetch is wasted but not wrong.

**Memoisation key:** the `reconciledView` is invalidated by a generation counter bumped on any selectedIds mutation AND on each chunk completion during lazy recompute. No structural diffing.

## 8. What gets reconciled, what doesn't

Mirroring Kahuna's structural rule — fields that don't make sense across multiple images are simply not rendered in multi-select.

**Selection-of-one renders the single-image panel.** A selection of exactly one image renders `ImageMetadata` (the single-image detail component) verbatim — no `multiSelectBehaviour` filtering applied. Otherwise ticking one image would silently hide rows like filename, dimensions, lease list, identifiers — jarring and wrong. The multi-select code path (suppression, partial/full chips, summary lines, `Multiple values` placeholders) is gated on `selectionCount >= 2`. The natural panel branch is `count === 0 ? Empty : count === 1 ? Single : Multi`. **Implementation consequence:** `MultiImageMetadata` and `ImageMetadata` must share the row-rendering primitives (extracted to `metadata-primitives.tsx` in S4) so the count=1 case is byte-identical to single-image detail.

The field registry will gain a new optional flag: `multiSelectBehaviour?: "reconcile" | "chip-array" | "always-suppress" | "show-if-all-same" | "summary-only"`.

- `reconcile` (default for editable text fields): runs full reconciliation, shows value or "Multiple values".
- `chip-array`: per-chip partial/full visual via the shared chip component (keywords, people, labels, subjects). Reconciliation groups by chip value across the selection and emits `{ chips: [{ value, count }], total }`.
- `always-suppress`: never shown in multi-select (id, fileName, suppliersReference, dimensions, uploadTime, identifiers).
- `show-if-all-same`: shown only when all selected items agree (uploadedBy, source_mimeType — "12 selected items, all JPEG" is useful; "Multiple file types" is less so). Otherwise hidden.
- `summary-only`: rendered as a count-summary line, no per-record reconciliation. Used for leases (and any future field whose multi-select view is intentionally "just the headline counts").

The authoritative per-field assignment lives in [`field-catalogue.md`](field-catalogue.md).

**"Important empty fields" parity with Kahuna.** Kahuna's behaviour is structural: certain fields (title, description, special instructions, date taken, credit) render even when all selected items are empty, signalling "these matter, here is where you'd add them". Phase 2 has no editing, so this signalling is currently informational only — but the field registry should already mark these fields as `showWhenEmpty: true` so the Phase-3+ edit affordance lands cleanly.

**Array fields (keywords, people, labels, subjects).** Per the pills/location/leases findings
([`../01 Research/selections-kahuna-pills-location-leases-findings.md`](../01%20Research/selections-kahuna-pills-location-leases-findings.md)),
Kahuna *does* reconcile chip arrays — via a single shared component
(`ui-list-editor-info-panel`) that computes `getOccurrences` per chip across the selection and
visually differentiates **partial** chips (chip on some images: hollow / white pill,
`element--partial` CSS class) from **full** chips (chip on every image: filled / dark pill). No
count badge, no tooltip, no grouping — just the binary partial/full distinction. Editable
(keywords / people / labels) chips also gain a `+` "Apply to all" affordance on partial chips
and an "X" remove on every chip. Subjects is `is-editable="false"` in Kahuna — read-only
display in multi-select. Kupua mirrors this contract for v1 display: a `partial: boolean` prop
on the chip component, the same hollow/filled visual, **no count badges**. (An earlier draft
of this doc proposed `Reuters ×12` badges; dropped because (a) Kahuna doesn't do it and we
have no UX evidence it helps, (b) it's a perf risk at 5,000 selected with high-cardinality
keywords that we haven't measured, (c) easy to add later if dogfooding asks for it.)

**Composite-scalar fields (location).** Location is rendered as four independent rows —
`subLocation`, `city`, `state`, `country` — each reconciled independently. A selection can be
"all-same" on country but "mixed" on city, and the panel shows that. Kupua mirrors this:
location is registered as four scalar entries (or one synthetic `location-segments` group with
per-segment `FieldReconciliation`), not as a composite path. Editing in Kahuna saves all four
in one batch but display is fully per-segment.

**Lease fields (summary-only).** Leases get their own `multiSelectBehaviour: "summary-only"`
classification. In Kahuna multi-select the per-lease list is hidden entirely
(`ng-if="ctrl.totalImages === 1"`); only a count summary is shown:
`"3 current leases + 2 inactive leases"`. No reconciliation across leases (no identity match,
no intersection). Kupua mirrors this — the panel renders the same kind of summary line and
nothing else for leases. Reconciling individual lease records across N images is high-stakes
(legal/rights), out of v1 scope, and Kahuna's "don't try" answer is the safe default.

**Cost pills (`N free / N paid / N restricted` etc. with lease-percentage gradients).** Kahuna
shows these in `gr-info-panel` above the metadata panel. They depend on a server-derived `cost`
field that Kupua does not currently index/expose. Out of v1 reach; tracked as a backlog item
when the cost field becomes available client-side.

**Per-field classification — see [`field-catalogue.md`](field-catalogue.md)** for the full table mapping each of Kupua's 33 fields (26 hardcoded + 7 default config aliases) to `multiSelectBehaviour` + `showWhenEmpty`. Summary: 23 reconcile, 8 always-suppress, 2 show-if-all-same; 6 fields marked `showWhenEmpty: true` (title, description, specialInstructions, byline, credit, dateTaken) per Kahuna's important-empty signal.

**Notable deviations from Kahuna's per-field behaviour** (logged in `../deviations.md`):
- **All config alias fields reconcile** (Kahuna suppresses them entirely in multi-select). Cheap, more useful, particularly valuable for `digitalSourceType` where mixed human/AI is editorially significant. `FieldAlias` may later gain optional per-field overrides if a Grid operator needs them — not built until concrete need.
- **`source_mimeType` show-if-all-same** (Kahuna suppresses). "All 47 are JPEG" is useful confirmation; mixed is hidden as noise.
- **`metadata_suppliersReference` and `metadata_bylineTitle` reconcile** (Kahuna suppresses by single-image gate). Promoted by analogy to byline/shoot-code semantics.

## 9. Drift handling — selection vs search results

> **Status (v1, 2026-05-03):** under the default `SELECTIONS_PERSIST_ACROSS_NAVIGATION = false`, drift cannot accumulate — selections clear on any new search, so the selection set always equals (or is a subset of) the current results. The drift UI described below is **deferred** until either the flag is flipped or the future **Clipboard** (My Places) component arrives and a durable cart genuinely diverges from the active search. The design is recorded here so the implementation is straightforward when needed.

A user selects 50 items, then changes the search; only 12 of those 50 match the new query.

**Behaviour (when the flag is flipped, or once Clipboard ships):**
- The 50 stay in `selectedIds`. The set is sacred.
- The status bar shows: `"50 selected · 12 in current view"`. (Format: TBD on review; alternative `"50 (12 here)"`.)
- The Details panel shows reconciliation across **all 50**, not just the 12 (selection-as-shopping-cart).
- A small "Show only selected" toggle in the toolbar lets the user filter results to just their selection — implemented as a filter chip `id:(id1 OR id2 OR …)`.

When the user navigates back to a query containing more of the selected items, the selection is still there. Persistence is the *whole point* under that mode.

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
1. Count chip: `12 selected`. Drift split (`· 8 in view`) deferred — see §9.
2. **Clear** button (always visible in Selection Mode — primary exit affordance).
3. Action slots — empty in v1. Placeholder for Phase 3+ download/share/edit/archive.

**Persistence-across-navigation escape hatch.** The "survives everything" behaviour (§9) is gated by `SELECTIONS_PERSIST_ACROSS_NAVIGATION` in `constants/tuning.ts`. Default `false` (selections clear on any non-sort search; survival matrix in §4). Flipping to `true` enables the original drift model; the drift counter and "Show only selected" filter (§9) become reachable UX work at that point.

The bar replaces nothing; it appears in the toolbar area and pushes other items right (or wraps on narrow widths). Mobile: the bar slides up from the bottom (sheet-style) and contains only the count and Clear, plus a hamburger for future actions. (S5 ships this as `SelectionFab` — a floating action button — on coarse-pointer profiles; the StatusBar count is hidden on coarse pointer.)

## 12. Details panel — branching

When `selectionCount === 0`: show `<ImageMetadata image={focusedImage} />` (current behaviour, unchanged).

When `selectionCount > 0`: show `<MultiImageMetadata />` — a new component that:
- Reuses internal primitives from `ImageMetadata.tsx` (`MetadataSection`, `MetadataRow`, `MetadataBlock`, `FieldValue`) — these get extracted to a small `metadata-primitives.tsx` module. Low-risk refactor.
- Reads `reconciledView` from the selection store via memoised selectors.
- For each field: dispatches on `FieldReconciliation.kind`:
  - `all-same` → renders the value with the same `FieldValue` component used in single-image view.
  - `all-empty` → shown only for `showWhenEmpty: true` fields, with subtle "—" placeholder.
  - `mixed` → renders a `MultiValue` component (new): displays "Multiple values" plus, on hover/tap, a small popover with the sample values + counts.
  - `chip-array` → renders a chip list using `MultiSearchPill` (new — extends `SearchPill` with a `partial: boolean` prop). Partial chips render hollow/white per the Kahuna `element--partial` mechanism. No count badges (deviation deliberately rejected; see §8).
  - `summary` → renders the `line` string as a plain `<dd>` text node. No further structure. Used by leases.

The focused image, if any, is **suspended** in multi-select mode — its single-image metadata is not shown. Rationale: the panel is one surface; we shouldn't double up. (Alternative considered: split panel with both views. Rejected as visually noisy and confusing.)

When the user clears selection, the panel reverts to focused-image metadata.

**Focus during Selection Mode — visually gone, retained in memory.** When `selectionCount > 0`:
- The focus *ring* on cells is suppressed (`isFocused` derived state evaluates to false in Selection Mode for visual purposes).
- `focusedImageId` in the store is **not cleared** — if it was set before entering selection mode, it persists for history snapshots and will become visible again on exit.
- **However**, `focusedImageId` is commonly `null` in Selection Mode because selection clicks (`toggle`) do not set focus. The user enters selection mode by ticking (no focus set), selects more items, then changes sort — at that point `focusedImageId` is null and the **selection anchor** provides position preservation instead (see §4, "Position preservation on sort changes").
- Arrow keys move per-row in Selection Mode (existing keyboard navigation behaviour kicks in when no visible focus exists — this Just Works).
- Space key (S5+) toggles the cell at the current arrow-keyboard position. Shift+arrow (S5+) extends selection from anchor to the new arrow position.
- On exit from Selection Mode (count drops to 0), `focusedImageId` (if still set) becomes visible again — user finds focus exactly where they left it.

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

- Selection persists across **sort, reload, density change, image-detail open/close, and tier-mode change**, but clears on any new search and on browser back/forward (Kahuna drops on every route change). Trade-off: more state to manage; mitigated by silent drop + toast on missing items at hydration. The `SELECTIONS_PERSIST_ACROSS_NAVIGATION` flag in `constants/tuning.ts` (default `false`) is the one-line escape hatch back to "survives everything" — reserved for future Clipboard work.
- Shift-click range never silently drops items between anchor and target (Kahuna does, requiring users to scroll-load). Trade-off: server roundtrip in two-tier+; mitigated by hard cap (5k) and informational toast at soft cap (2k).
- No Cmd/Ctrl-A. Justified by multi-million scale.
- Anchor is sticky across shift-clicks (Kahuna's anchor is "last added URI", causing repeated shift-clicks to misbehave).
- Touch support via long-press + second-long-press range (Kahuna has none). Paint-drag was attempted and cut — see [`../deviations.md`](../deviations.md).
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
