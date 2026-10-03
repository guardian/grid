# Focus, Phantom Focus, and Position Preservation

> Describes current behaviour and the code that delivers it. Timeless by design:
> no history. Where code and this document knowingly disagree, the disagreement
> is an item in the [cleanup ledger](../not-yet-another-audit-ledger.md), marked
> here as *(Lx)*. Buffer, seek and tier mechanics: [scroll architecture](03-scroll-architecture.md).
> kupuaKey and snapshot storage: [browser history](04-browser-history-architecture.md).
> Selection lifecycle: [selections](05-selections.md).

> **Policy status:** D8 is under reconsideration. Sections below mix source-based
> descriptions and intended guarantees; they are not a completed characterisation.
> Characterisation, written-contract conflicts, bugs and operator decisions belong
> in the [working ledger](../not-yet-another-audit-ledger.md), not this architecture
> guide. Update this guide with settled behaviour after that work is complete.
> Do not derive new fixes from an unresolved policy.

## 1. Principle: Preserve Strictly, Relax Deliberately

"Never Lost" ([philosophy](01-frontend-philosophy.md)): across every transition the
user's place stays anchored to an identified image.

1. Every transition first meets the strictest guarantee: the anchor image stays
   at the same viewport position.
2. Individual transitions then relax it on purpose. A relaxation names its
   target (*top of results*, *visible centre image*, *a specific image*) and is
   listed in §4. Losing place without a listed relaxation is a bug.

Explicit focus is the scaffolding that makes the strict guarantee testable: one
identified image the user chose. Phantom mode hides the scaffolding; the engine
underneath is the same.

Scroll tiers (§3.1) are an implementation detail: every behaviour in this
document is the same in every tier.

## 2. Anchors

| Anchor | Meaning | Source |
|---|---|---|
| Explicit focus | `focusedImageId` with a visible ring, set by click or keys in explicit mode. A durable bookmark: survives scrolling away, seek and eviction | `search-store.ts` |
| Remembered detail image | Last image returned from detail in Click-to-Open, stored without a ring. Accepted query/filter and AI-exit anchor even after scrolling away | `focusedImageId`, written by detail entry/return |
| Selection anchor | Last-interacted selected image, while a selection exists | `selection-store.ts` `anchorId` |
| Viewport centre | Rendered image nearest the centre of the usable viewport (below the table header). Elected from DOM geometry only when a transition asks; not tracked per scroll frame | `getViewportAnchorId()` in `useDataWindow.ts` |
| User search continuity | Ordinary and AI target, placement and focus treatment; ordinary fallback neighbours; resolved target is published with its existing operation owner | `lib/search-continuity.ts`, `search-store.ts`, effect 9 |
| History continuity | Matching destination snapshot's represented target, ratio-or-start, focus/NONE and top fallback; no departing chooser/candidates | `historySearchContinuity`, existing store owner and effect 9 |
| Positioning id | One-shot `_phantomFocusImageId`: search asks the view to place an image without focusing it | `search-store.ts`, consumed by effect 9 |

Anchor precedence depends on the transition; there is no settled universal rule.
Settled density currently prefers a resolvable focus, then viewport centre; grid reflow
prefers selection, then focus, then viewport centre. History capture prefers
explicit focus in explicit mode, otherwise viewport centre. L7 must reconcile
these layout paths with D5 and the unsettled D8 policy before L15 changes.

A history entry's focus (including no focus) and viewport position are separate
concerns. Position restoration must not discard that entry's focus or substitute
another entry's. This requirement does not prescribe every scrolling outcome:
the operator will decide those cases from the characterisation table.

Click-to-Open has no explicit focus affordance, but may remember the last image
returned from detail. For ordinary query/filter changes and AI exit, that identity
takes precedence over the browsed centre, even off-screen, if it survives. Ordinary
query/filter and AI exit without that identity use the browsed centre without
creating explicit focus. L39 is reviewed and locally verified; wider verification
limits remain in the ledger.
Ordinary sorting without selection retains its clear-and-top relaxation.

This is revisable policy, not permission to carry a departing bookmark into a
different history entry. Layout may preserve meaningful focus/selection or browsed
centre, with legitimate true-result-edge handling; no accidental third target is
accepted. Density, reflow, height-only and history preferences remain separately
decidable. Policy changes must not weaken ownership or coherent-publication checks.

Ordinary and user-initiated AI search/sort precedence is chosen once by
`captureSearchContinuity` in `lib/search-continuity.ts`. Effect 7 captures it; URL
sync consumes it. History derives a separate destination-only handoff and shares
owned resolution/publication/placement. Density save, grid column change, snapshot
capture and keyboard navigation retain transition-specific decisions *(L9)*.

## 3. Engine Map

### 3.1 Tiers and Coordinates

`isTwoTierFromTotal(total)` is the only coordinate-space decision; position-map
arrival never changes it.

| Tier | `total` | Virtualizer index | Buffer | Scrubber |
|---|---|---|---|---|
| Buffer | ≤ `SCROLL_MODE_THRESHOLD` | buffer-local | whole set (first page, then background fill) | scrollbar |
| Two-tier | ≤ `POSITION_MAP_THRESHOLD` | global; unloaded cells are skeletons | window; scrolling outside it triggers a debounced seek | scrollbar |
| Seek | above | buffer-local (`bufferOffset` maps to global) | window of ≤ `BUFFER_CAPACITY` | seek on click or drag release |

`imagePositions` (ID to global index, loaded images only) is the only way to
locate an image. Views convert with `findImageIndex` and `getImage`.

### 3.2 Publication and Placement

The store never scrolls. It publishes a signal in the same `set()` as the data,
and one layout effect in `useScrollEffects.ts` places the viewport before paint.

| Signal | Published by | Placement |
|---|---|---|
| `_prependGeneration`, `_forwardEvictGeneration` | `extendBackward`, `extendForward` | Effects 4/5: shift `scrollTop` by the exact row shift of the top visible item (not in two-tier) |
| `_seekGeneration` with target index and sub-row offset | `seek`, `restoreAroundCursor` | Effect 6: move only if off by more than a row, then apply Home/End intent |
| `_scrollReset` | `search` without a surviving anchor, find-focus fallbacks, AI re-sort | Effect 7b: top (table keeps horizontal scroll on sort) |
| `bufferOffset` deep to 0 | `search`, `seek(0)` | Effect 8: top, except during small-set top-up (`_bufferSelfCorrecting`) |
| `sortAroundFocusGeneration` with resolved continuity or legacy positioning id | `search`, `_findAndFocusImage`, `resortAiBuffer` | Effect 9: owned ordinary/AI/history placement once; limited cursor/arrow consumers remain |

Completion means a scroll write, not proof of indefinitely stable geometry.
Density remount readiness waits two frames. A pending browsing destination
survives until its ready placement can be consumed by the current view.
While a seek-tier destination loads, the density bridge retains the visible departure
anchor under the same navigation signal. The thumb follows the owned destination;
neither departure restoration nor a viewport report declares navigation complete.

### 3.3 Placement Values

A placement is an anchor plus a viewport ratio. Four captures exist *(L10)*:

- **Search/sort ratio** `(rowTop − scrollTop) / clientHeight`, without header.
  Ordinary and AI user changes capture target, ratio, focus treatment and neighbours
  together in effect 7's layout phase, before URL sync's passive search dispatch.
  The handoff is scoped by destination and existing search generation. Missing
  matching view capture uses the same chooser against available geometry.
  History instead derives target and placement together from its matching snapshot;
  the independent numeric ratio bridge is removed from these adopted paths.
- **Density** ratio including header offset, plus source scroll extremes; saved
  on view unmount, restored two frames after the next mount.
- **Grid column change**: `captureAnchorAtIndex` / `restoreAnchorScrollTop`.
- **History snapshot** `viewportRatio`, same formula as the search ratio.

Edge rules: a row that would be clipped is shown whole at the nearest edge;
results are clamped to the scroll range; density restore snaps to top or bottom
when the source was there or the result is within a row of an edge.

### 3.4 Staleness

- Search generation (`getSearchGeneration`) invalidates search-derived work.
- Ordinary and AI continuity bind that generation and the existing focus signal. Its
  History shares these owners with destination-derived continuity. The resolved
  target is published atomically with the window; effect 9 checks ownership
  and density readiness, then marks placement consumed. A later density mount cannot
  replay it. Small-result fill retries retain the same owner plus existing geometry,
  focus, scroll and seek guards.
  Relevant newer input during any mount-frame wait retires an already-published
  ready placement without cancelling its request owner or changing focus/selection.
  Input before publication does not suppress the later search's placement. Saved,
  navigation/invalid-index and fallback mount chains share this input watcher and
  dispose it on completion or unmount. Readiness is not permission to overwrite
  post-publication input; legacy density target policy remains separate.
- AI's pending continuity record waits for owned finite publication. Same-query
  re-sort replaces only the focus/placement signal, not search discovery or its
  generation. Completion adopts the latest handoff and supported sort; settled
  re-sort remains request-free. Exit sends identity into ordinary lookup without
  an AI rank hint or synthetic cursor. Pending AI history waits for owned finite
  publication rather than reordering/placing departing ordinary data.
- `_searchAbortController` owns initial ordinary/AI reads. A newer search replaces
  it; explicit browsing retires ordinary initial placement, not query discovery.
  The replacement reuses the existing count (or counted first page on count failure)
  and publishes the current total with its window. Initial placement stays retired
  even after a later cursor/focus replacement. Automatic refill/density cannot take
  this authority; AI never enters ordinary window reads.
- `_browseNavigation` retains a scoped destination through queued, loading and
  ready phases. Its separate signal survives density but not newer navigation,
  search, cursor restore or snap-back. Indexed scrubber intent is recorded before
  native scrolling, including the sibling Scrubber's wheel bridge; real scroll input
  can queue it before the data request exists.
- The pending initial signal is cleared by identity. Browsing records whether
  it invalidated the resident page, so Home rebuilds the
  current-order first page in that case rather than using its normal resident shortcut.
- Cursor/focus replacements inherit unfinished discovery and cannot use old resident
  membership. Missing targets, failed replacements or cancellation without a successor
  can use the already-requested first page; a newer owner suppresses that fallback.
  Failure of both discovery requests settles loading without inventing a result set.
- `_rangeAbortController` owns extends, fill, automatic refill and cursor restore.
  Density's `cancelWindowMaintenance` cancels that work without cancelling initial
  search or browsing. Reset callers retain broad `abortExtends` cancellation.
  Fill captures its signal at launch; refill completion cannot clear another
  foreground owner's loading state. Focus lookup/centred loading retain their own
  controller, superseded by search, explicit browsing, cursor restore or a newer
  snap-back. Cursor takeover clears the superseded focus status as well as its signal.
- `_seekCooldownUntil` blocks extends after search, seek and backward extend.
- History subscriptions cancel reset-to-home, pending traversal and delayed sort.
- One-shot suppression flags are symbol-owned with release functions.

## 4. Transitions and Relaxations

| Transition | Guarantee | Relaxation (target) |
|---|---|---|
| Query / filter change, including AI entry/exit | Retained focus (including remembered detail identity in Click-to-Open), otherwise browsed centre; anchor kept at the same ratio | Ordinary destination: existing neighbour fallback, otherwise top. Finite AI destination: missing target resets to top without neighbour lookup |
| Sort change | Explicit focus or selection anchor kept at the same ratio | Phantom mode without selection: top |
| Scrubber seek | Viewport goes where asked; explicit focus stays a bookmark | none |
| Home / End | Viewport at the edge; explicit focus moves to first/last only if it existed | none |
| Buffer extend / evict | Visible content does not move | none |
| Density switch | Pending browsing destination wins across the view change. Once settled: resolvable focus supplies the placement anchor, otherwise viewport centre; top/bottom snapping applies | Settled anchor precedence awaits L7/L15; smaller placement drift remains L18 |
| Browser resize / panel toggle (grid column change) | Current: resolvable selection, then focus, then viewport centre supplies the placement anchor | Reconcile this with D5 and visibility cases in L7 before consolidation |
| Detail / preview close | Entry image: native placement. After traversal: last viewed image centred | Click-to-Open pulses without a ring; remembered detail identity remains eligible for later query/filter and AI-exit anchoring |
| Browser Back / Forward | Destination snapshot supplies represented anchor, placement and focus/NONE in CURRENT density; distinct same-query native entries restore too | Missing/mismatched/null snapshot or genuine missing anchor: top/no focus, no departing neighbour. Marked origin/detail transition retains native list |
| Logo (Home) | none | Top of default search; focus/selection cleared, grid reset after owned data unless newer density intent wins |
| New-images ticker | none | Top of refreshed results |

Undecided relaxation candidates are ledger decisions, not behaviour.

### 4.1 Search Context Change

1. `useScrollEffects` effect 7 captures ordinary and AI user search/sort continuity once:
  target identity, placement, focus treatment and fallback neighbours. Selected
  sorts retain focus independently of target equality; query/filter ignores
  selection as a placement target. `useUrlSearchSync` classifies navigation,
  clears selection when appropriate and passes the captured record to `search`.
  History derives target/placement/focus/fallback from the destination snapshot, not
  the departing view. AI re-sort passes
  the same record to its in-memory action, replacing only placement ownership.
2. `search` fetches the first page, or the finite AI list. Anchor on it: publish
  with the effect-9 signal. A missing finite-AI target resets to top; steps 3-7
  apply only to ordinary destinations.
3. Anchor not on it: the old buffer stays visible while `_findAndFocusImage` gets
   the anchor's sort values and offset (position map, else `countBefore`), loads
  a buffer around it and publishes once with the resolved continuity record.
4. Anchor absent from the new results: neighbours are checked with one ids query,
   nearest first (explicit: ±20 buffer images; phantom: visible images).
  Destination-history handoffs exclude this fallback and use top/no focus.
5. First surviving neighbour: positioned as in step 3.
6. No survivor, error, or 8 s timeout: first page at top, focus cleared.
7. Small result sets are then topped up to the full set. While the first page is
   still filling, a near-bottom anchor whose ratio cannot yet be reached is retried
   as the buffer grows; any newer search, seek, focus change or scroll discards it.

### 4.2 Seek and Keys

- Deep seeks land by estimate; the viewport stays where the user is, avoiding a
  flash. Exact seeks (shallow, position map) target the position directly.
- Home/End record `_pendingFocusAfterSeek`, owned by that seek; a later seek
  replaces it. This captures permission to move focus, not navigation authority.
- Density carries temporary departure geometry under a pending seek's signal,
  preserving the visible neighbourhood without replacing the destination.
  Ready placement remains available across remount, waits for the new geometry,
  then consumes its owner once. Deferred viewport notification has its own timer
  lifetime and yields to newer search, navigation, input or unmount.
- An arrow key with explicit focus outside the buffer seeks back to the focus,
  then applies the move (`_pendingFocusDelta`).

### 4.3 Detail, Preview and Reload

- Detail overlays the list, which stays laid out at opacity 0, so list placement
  persists natively. Traversal replaces the URL `image`. The entry image is
  `_detailEntryImageId` in history state and survives traversal and reload
  *(L11: also tracked by component refs)*.
- Traversal works in global indices. An off-buffer neighbour waits for the buffer;
  changing image, context or history entry, or unmounting, cancels only that wait.
- The deferred centring after traversal re-reads index and geometry when it runs;
  reopening, a newer search, history entry or focus change makes it inert.
- Marked detail entries record their originating list key separately from the
  immutable entry image. Return acts only for that origin; unrelated native
  destinations restore their represented snapshot. A marked entry-key switch
  adopts destination entry-image identity; same-entry traversal retains it.
  Unmarked older detail entries keep compatibility close behavior.
- Reload in detail restores the buffer around the image from its cached cursor
  (`restoreAroundCursor`); the list shows it at the top row.
- Fullscreen preview owns a history entry so Back closes it. After traversal it
  centres the last image once window resizing settles; each entry owns its own
  centring, so re-entry makes an older one inert.

### 4.4 Back / Forward and Reload

- Before each push, the departing entry's snapshot is saved under its kupuaKey:
  anchor, global offset, ratio and new-images cutoff. On Back/Forward the departing
  entry is recaptured (phantom snapshots only when the anchor image changed).
- The destination snapshot applies when its search key matches exactly: anchor
  positioned (phantom: without focus), ratio reused in current layout; freeze
  boundary is the later saved/current cutoff, not immutable historic membership.
  Snapshots live in sessionStorage (50 entries) and survive reload.
- Snapshots do not independently store explicit focus and viewport anchor. Merely
  switching to a viewport anchor can lose the entry's focus; it is not a complete
  implementation of independent restoration. A new two-identity snapshot model is
  outside this unit. Phantom capture represents viewport/NONE, not an independently
  retained hidden bookmark.
- `historySearchContinuity` binds represented target/ratio-or-start/focus/NONE and
  top fallback to the existing owner. B13 excludes departing neighbours; B14 applies
  represented focus/NONE through resident AI re-sort without requests. Pending
  discovery remains useful even if placement is retired.
- Router history action records native destination identity before query dedup;
  raw/validated parameter coherence prevents premature capture/consumption.
- Density is session-persisted UI state outside URL/history. Read before the first
  view mounts, write actual choices promptly; fresh independent tabs default grid.
  Navigation/AI/detail/Back/Forward/reload retain current choice. Invalid/unavailable
  storage stays usable; no cross-tab sync or legacy density-link handling.
  B1's density-only producer is removed, not migrated. Q1/Q7 remain unchanged.

### 4.5 Reset to Home

The logo waits for the fresh first page before changing the URL, avoiding a
table-to-grid flash. A later history change or newer search cancels it. It
suppresses a pending `restoreAroundCursor`, the return-from-detail placement and
the table's density save *(L12)*.

Home also resets the tab's density preference to grid, retaining
fresh-data-before-layout timing. A later density choice wins without cancelling
Home's search reset; an abandoned Home cannot change or persist density. Back after
Home retains the current density. Ownership compares density intent, including
same-value and away/back actions, not equality of the final preference value.

## 5. Two UI Modes, One Engine

The engine runs identically in both modes; they differ in what the user sees and
can do, and in the relaxations listed in §4.

### 5.1 Explicit Focus Mode (desktop default, power users)

| Interaction | Effect |
|-------------|--------|
| Single-click an image | Sets explicit focus (visible ring) |
| Double-click an image | Enters image detail |
| Arrow keys | Move focus between images |
| PageUp / PageDown | Move focus by one page of rows |
| Enter | Opens focused image in detail |
| Backspace (from detail) | Returns to list, focus on the image that was open |
| `f` key | Fullscreen preview of focused image (from list/grid) |
| Escape (from fullscreen preview) | Returns to list/grid |
| Escape (from fullscreen within detail) | Returns to image detail |
| Home / End | Focus first / last image, scroll to it |

This is the strictest mode: every guarantee in §4 is exercised with an
identified anchor.

### 5.2 Phantom Focus Mode (touch devices, optional desktop preference)

| Interaction | Effect |
|-------------|--------|
| Single-click / tap an image | Enters image detail directly |
| Arrow keys | Scroll by rows (no focus movement, no focus reveal) |
| PageUp / PageDown | Scroll by one page of rows |
| Enter | No effect (no focused image to open) |
| `f` key | No effect (no focused image to preview) |
| Backspace (from detail) | Returns to list; pulses the image (centres it if traversed) and retains its remembered identity for later query/filter and AI-exit continuity |
| Middle-click | Fullscreen preview of that image; currently stores its identity without a ring |
| Escape (from fullscreen within detail) | Returns to image detail |
| Home / End | Scroll to top / bottom (no focus) |
| Swipe left/right (touch) | Navigate prev/next in detail view |

There is no explicit focus affordance in this mode: no ring, no keyboard path to
one. Selection uses its own gestures (§6). Remembered detail identity and inferred
viewport centre are distinct continuity inputs; absence of a ring does not make
the former invalid. Their precedence is transition policy, not request ownership.

### 5.3 Why Not Reveal Focus on Arrow Keys?

It's tempting: keep focus hidden, but reveal it when the user presses an arrow
key (desktop keyboard users would "discover" focus). Two reasons not to:

1. **Once revealed, click-to-enter breaks.** If pressing ↓ creates a visible
   focus, the user now expects single-click to enter detail (they can see the
   focused image — why would they double-click?). But single-click sets focus in
   explicit mode. The modes become muddled, and you need a third hybrid mode.

2. **Users expect arrows to scroll rows.** Grid/Kahuna users (and most app users)
   expect ↑↓ to scroll the viewport by one row. In explicit focus mode, arrows
   move the focus ring, which feels different — you traverse one image at a time
   through a full page of thumbnails before the viewport starts scrolling. Users
   who prefer the scrolling behaviour would be surprised by a mode that silently
   switches to focus behaviour when they press an arrow key.

The clean answer: phantom focus mode has no focus affordance. Period. If we
later need keyboard-accessible focus in phantom mode (e.g. accessibility
requirements), we design it intentionally rather than letting it leak.

### 5.4 The Preference

A `focusMode: "explicit" | "phantom"` setting, persisted in localStorage and read
through `getEffectiveFocusMode()`.

- **Desktop default:** `explicit`.
- **`pointer: coarse`:** always `phantom`, ignoring the preference. Switching to
  phantom clears any focus.

The preference controls:
- Whether single-click sets focus or enters detail
- Whether the focus ring renders
- Whether arrow keys move focus or scroll rows
- Whether `Enter` and `f` operate on the focused image

It does **not** control the engine: every transition in §4 applies in both modes,
with the mode-specific relaxations listed there.

---

## 6. Relationship to Selections

Selections are implemented separately from focus, with shared position-preservation
mechanisms where the transition requires them:

- **Selection is multi-persistent; focus is single-ephemeral.** Selecting images
  does not move focus. Moving focus does not alter the selection.
- **Selection survives density changes** (same as focus — "Never Lost" applies).
- **Selection supplies a position anchor for sorting.** The active selection's
  last-interacted image is the continuity point for sort changes, ahead of an
  older, visually suppressed focus. Layout precedence is a separate, transition-
  specific choice (§2/§4). Preserving that image does not mean keeping every selected image
  on screen. Search/filter navigation normally clears the selection; its
  persistence policy is documented separately.
- **Selection gestures must not conflict with focus/detail entry.** In explicit
  focus mode, single-click = focus, double-click = detail, so selection needs a
  separate gesture (checkbox, Ctrl/Cmd-click, or a selection-mode toggle). In
  phantom focus mode, single-click = detail, so selection again needs a separate
  gesture (checkbox, long-press on mobile, or selection-mode toggle).
- **The metadata/details panel** shows metadata for: (a) the selection, if any
  images are selected; or (b) the focused image, if no selection but explicit
  focus exists; or (c) nothing, if neither. Selection takes priority.

The [selection guide](05-selections.md) owns the current lifecycle, persistence and
anchor-precedence details. Clearing selection leaves the viewport stationary and
restores the older focus's ordinary role without creating new focus. A query/filter
that automatically clears selection follows that retained focus if it survives,
just as explicit Clear followed by the transition does.

---

## 7. Comparison with Kahuna

Kahuna has no focus: single-click opens detail, arrows scroll, and the only
position preservation is returning from detail to the previous scroll position.
Phantom mode matches that interaction model; the engine adds every other
transition in §4. Explicit focus is a Kupua-only power-user capability.

