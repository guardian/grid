# Assessment: Kupua Structural Audit & Refactoring Plan

**Date:** 2 April 2026
**Input documents:**
- `kupua-structural-audit.md` — the 5-phase refactoring plan under review
- `KUPUA_CAPABILITIES_REPORT.md` — what kupua has built (read-only search/browse)
- `kahuna-service-communication-audit.md` — what kahuna does with every Grid microservice
- `extracted-principles.md` — guiding philosophy, architectural principles, non-negotiable rules
- `frontend-philosophy.md` — density continuum, Never Lost, click-to-search, selection ≠ focus

**Purpose:** Evaluate whether the proposed refactoring makes future work (Kahuna feature integration, extensibility for third-party Grid deployments) easier, harder, or unchanged. Identify gaps and tensions.

---

## Executive Summary

The refactoring plan is **structurally sound for its stated goals**: readability, DAL boundary repair, team rotation, and parallel development. The three-layer model, the API-shaped core interface, the `enhanced-es-engine.ts` with future-API-shaped methods, and the store split are all good engineering decisions.

**However, the plan was written in isolation from the 27 features kupua must eventually absorb.** It optimises the *read path* architecture (search, browse, scroll, scrub) without stress-testing against the *write path* (edit, crop, lease, upload, collect) or the *extension path* (custom panels, third-party actions, organisation-specific fields). Three significant gaps emerge:

1. **Write coordination has no architectural home.** Every kahuna write feature uses optimistic-update + poll-until-reindexed. The refactoring creates read-path stores but doesn't define where write orchestration lives.

2. **Multi-select is acknowledged but under-specified.** The `selection-store.ts` is "empty body, interface only" — but selection interacts with every other store and is the foundation of batch operations, the core editorial workflow.

3. **Extensibility is absent.** Grid is used by multiple organisations. The plan has no plugin system, no panel registration API, no stable public selectors, no hook points for custom actions. This is not just a future concern — it's a guiding principle that should shape the store split and component structure *now*.

**Verdict:** Proceed with all five phases, but amend Phases 2 and 4 to address these gaps. The cost is ~1–2 additional developer-days on top of the 9–14 estimated. The alternative — bolting extensibility and write-coordination onto an architecture that wasn't designed for them — costs 3–5× more later.

---

## Part 1: Phase-by-Phase Verdict

### Phase 0 — Throwaway Testing Harness ✅ Helps

The DAL contract tests, visual regression screenshots, and sort-around-focus position test are a reasonable safety net that complements the existing 235 tests. One addition:

- **Add write-path contract stubs.** The DAL contract suite should include empty method signatures for future write operations (`updateMetadata`, `addToCollection`, `createCrop`, etc.) that throw `"not implemented"`. This makes the Grid API surface visible from day one and prevents anyone from accidentally assuming direct-ES for writes. Cost: 30 minutes.

### Phase 1 — Extract Imperative Services ✅ Helps, minor gap

Fixing circular deps (`SearchBar` as service provider, component→component imperative imports) is unambiguously correct. `resetToHome()` extraction eliminates real duplication.

**Gap:** `search-orchestration.ts` is created to hold search-related coordination. But it will inevitably become the coordination hub for *every* future workflow:

| Future workflow | Orchestration needed |
|---|---|
| Edit metadata → poll → refresh | `editAndSync(imageId, patch)` → edit-service → poll media-api → update buffer-store entry |
| Batch edit → sequential + progress | `batchEdit(selectedIds, patch)` → loop with progress → poll each → emit batch-complete |
| Upload → track → poll → refresh search | `uploadAndTrack(file)` → upload-service → poll status → trigger search refresh |
| Add to collection → poll → refresh | `addToCollection(imageIds, path)` → collection-service → poll → update image.collections |
| Create crop → poll → refresh | `createCrop(imageId, spec)` → crop-service → poll → update image.exports |

If `search-orchestration.ts` isn't designed as an *extensible* orchestration layer (named functions per workflow, not a monolithic coordinator), it will become the new god module.

**Recommendation:** Rename to `lib/orchestration/search.ts`. Create the `lib/orchestration/` directory structure during Phase 1, with `search.ts` as the first file and a README noting that future workflows get their own orchestration files (`edit.ts`, `upload.ts`, `collection.ts`). Cost: 0.

### Phase 2 — Split Store + DAL ✅ Most important phase — mostly right, three gaps

**What's right:**
- The API-shaped 4-method core interface is the best decision in the plan. It answers "what must GridApiDataSource implement?" in one glance.
- `enhanced-es-engine.ts` with future-API-shaped methods and explicit graceful degradation is excellent. The API enhancement backlog it creates is auditable and bounded.
- The store split into 6+ slices with explicit orchestration (not pub/sub) is the right coordination model for reads.
- The session abstraction for PIT (`openSession` → opaque handle → `closeSession`) correctly hides Layer 3 from Layer 2.
- `selection-store.ts` placeholder per Finding 13 is the right call.
- Tuning constants consolidation into `constants/tuning.ts` prevents scattering.

**Gap 1 — Write coordination has no home.**

The plan creates stores and a DAL for the *read path*. But every kahuna write feature follows this pattern:

```
user action → API call (metadata-editor / cropper / leases / collections)
  → optimistic local update (show change immediately)
  → poll media-api until ES reindexes (Thrall pipeline, typically 1–5s)
  → confirm or rollback local state
  → notify all subscribers (images-updated event in kahuna)
```

This is not a store concern or a DAL concern — it's a *service* concern. Kahuna implements it in `editsService`, `collectionsApi`, `mediaCropper`, `leaseService`, each with `apiPoll`/`getSynced`. Kupua's refactored architecture has `services/` as a "[future]" directory with no defined contract.

**Recommendation:** During Phase 2, define (not implement) the write-service contract:

```typescript
// services/types.ts — write coordination contract

interface WriteResult<T> {
  /** Optimistic local value (applied immediately) */
  optimistic: T;
  /** Resolves when ES has reindexed (poll confirms) */
  confirmed: Promise<T>;
  /** Abort the poll (user navigated away) */
  abort: () => void;
}

interface ImageWriteService {
  updateMetadata(imageId: string, patch: MetadataPatch): WriteResult<Image>;
  setUsageRights(imageId: string, rights: UsageRights): WriteResult<Image>;
  addLabel(imageId: string, label: string): WriteResult<Image>;
  removeLabel(imageId: string, labelUri: string): WriteResult<Image>;
  // ... etc
}
```

This interface defines the *shape* of every future write workflow without implementing anything. It forces the store split to leave room for optimistic updates in `buffer-store` (a `patchLocalImage(id, patch)` method) and for poll-driven refresh (a `refreshImage(id)` method). Cost: 2–3 hours of interface design, no implementation.

**Gap 2 — `SelectionSet` is too thin.**

Finding 13 correctly identifies multi-select as the missing architectural home. But "empty body, interface only" is insufficient because selection interacts with *every other store*:

| Store | Selection interaction |
|---|---|
| `buffer-store` | Buffer eviction must not discard selected images. When extending forward evicts from start, selected images in the evicted range need special handling. |
| `focus-store` | Focus and selection are orthogonal (philosophy doc). Arrow keys move focus without clearing selection. Shift+arrow extends selection. |
| `search-store` | On search change, selected images that leave the result set are silently dropped (philosophy doc "Never Lost"). |
| `aggregation-store` | Batch operations derive targets from selection. "Edit 5 images" needs `getSelectedImages()`. |
| Future `ActionBar` | `targetImages` = `selectedImages.length > 0 ? selectedImages : [focusedImage]` (philosophy doc §"Actions Written Once"). |

The interface needs at minimum:

```typescript
interface SelectionStore {
  selectedIds: Set<string>;
  toggle(id: string): void;
  rangeSelect(fromId: string, toId: string, allIdsInOrder: string[]): void;
  selectAll(idsInView: string[]): void;
  clear(): void;
  /** Called by search orchestration when results change */
  reconcileWithResults(survivingIds: Set<string>): void;
  /** For ActionBar and batch operations */
  getSelectedImages(): Image[];
}
```

**Recommendation:** Define this interface during Phase 2. The body can remain trivial (`Set<string>` operations), but the *interaction contracts* with other stores must be documented. Cost: 1–2 hours.

**Gap 3 — `Image` type shape is ES-specific.**

The `Image` type in `types/image.ts` mirrors ES `_source` document shape (flat fields, ES naming). The Grid API returns HATEOAS resources:

```json
{
  "uri": "https://media-api.../images/abc123",
  "data": { "id": "abc123", "metadata": {...}, "source": {...} },
  "links": [
    { "rel": "edits", "href": "..." },
    { "rel": "crops", "href": "..." },
    { "rel": "download", "href": "..." }
  ],
  "actions": [
    { "name": "delete", "method": "DELETE", "href": "..." }
  ]
}
```

Every store, component, and hook references `Image`. Changing its shape later is a codebase-wide refactor.

**Recommendation:** During Phase 2, introduce an `AppImage` type that wraps the raw source with optional HATEOAS metadata:

```typescript
interface AppImage {
  /** Image data — same structure regardless of source */
  data: ImageData;  // renamed from current Image type
  /** Available when loaded via Grid API, undefined when loaded via ES */
  capabilities?: {
    canEdit: boolean;
    canCrop: boolean;
    canDelete: boolean;
    editUri?: string;
    cropUri?: string;
    downloadUri?: string;
  };
}
```

Components consume `AppImage`. The ES adapter wraps `_source` as `{ data: esDoc, capabilities: undefined }`. The future Grid API adapter populates `capabilities` from HATEOAS links/actions. All permission checks (`canEdit`, `canDelete`, etc.) go through `capabilities` — mirroring kahuna's HATEOAS-driven pattern (`image.getAction('delete')`, `image.getLink('crops')`). Cost: 3–4 hours of type definition + mechanical rename.

### Phase 3 — Split Components ✅ Helps, low risk

Splitting `useScrollEffects` into 4 hooks and extracting Scrubber/Table sub-components are pure refactors. The existing test suite catches regressions. No concerns.

One note: the `useCellClickSearch.ts` extraction should be designed so that custom panels (§4) can reuse click-to-search behaviour without importing table-specific code.

### Phase 4 — Feature Homes ✅ Necessary but incomplete

The directory structure is correct for the *known* features. What's missing:

- No `extensions/` or `plugins/` directory (see Part 3 below).
- No `stores/auth-store.ts` or `services/auth-service.ts` — authentication is a prerequisite for every write feature and every Grid API call.
- No `services/types.ts` for the write-coordination contract.

**Recommendation:** Expand the Phase 4 directory structure:

```
src/
  ...existing proposed structure...
  extensions/
    types.ts             ← PanelRegistration, ActionRegistration interfaces
    registry.ts          ← registerPanel(), registerAction(), getRegisteredPanels()
    README.md            ← Extension API documentation for third-party devs
  services/
    types.ts             ← WriteResult, ImageWriteService interfaces
    auth-service.ts      ← [future] OIDC + session management
    edit-service.ts      ← [future] metadata + rights + labels + photoshoot
    collection-service.ts ← [future]
    crop-service.ts      ← [future]
    lease-service.ts     ← [future]
    upload-service.ts    ← [future]
  lib/
    orchestration/
      search.ts          ← (moved from search-orchestration.ts)
      README.md          ← Pattern for adding new workflow orchestrations
```

Cost: 1 hour (directories + README files + empty interface files).

---

## Part 2: Feature-by-Feature Stress Test

Does the *refactored* architecture have a clean place for each kahuna feature? Does any refactoring decision block it?

### Legend

- ✅ **Clean home** — the refactored architecture makes this easier
- ⚠️ **Workable but needs amendment** — minor gap in the plan
- 🔴 **Blocked or made harder** — the plan creates an obstacle

| # | Feature | Verdict | Where it lives | Notes |
|---|---|---|---|---|
| 1 | **Authentication & permissions** | ⚠️ | `services/auth-service.ts` + `stores/auth-store.ts` | Plan never mentions auth. Need session state and a way to inject auth headers into both ES adapter (tunnelled) and Grid API adapter. HATEOAS capability checks (`canEdit`, `canCrop`, `canDelete`) need the `AppImage.capabilities` type. |
| 2 | **Metadata editing (single)** | ⚠️ | `services/edit-service.ts` + `lib/orchestration/edit.ts` | Store split is fine. Missing: write-service contract (Gap 1), `buffer-store.patchLocalImage()` for optimistic updates, poll-until-reindexed pattern. |
| 3 | **Metadata editing (batch)** | ⚠️ | Same as above + `selection-store` | Batch edit = loop over `selection-store.getSelectedImages()` with progress tracking. Selection interface must be defined (Gap 2). Orchestration needs batch-progress events (kahuna's `events:batch-operations:progress`). |
| 4 | **Usage rights management** | ⚠️ | `services/edit-service.ts` | Same as metadata editing, plus: category change triggers auto-lease creation/removal (kahuna's `events:rights-category:add-leases`). This cross-service orchestration needs `lib/orchestration/rights-change.ts`. |
| 5 | **Collections (tree CRUD)** | ✅ | `components/collections/` + `stores/collection-store.ts` + `services/collection-service.ts` | Phase 4 directory structure has `collections/`. The refactored architecture supports this cleanly. Drag-and-drop from grid/table into collection tree needs `selection-store.getSelectedImages()`. |
| 6 | **Collections (image ↔ collection)** | ⚠️ | Same + `buffer-store` update | After adding image to collection, need to update the image's `collections` field in the buffer. Needs `buffer-store.patchLocalImage()` or poll-refresh. |
| 7 | **Crops (create/delete)** | ⚠️ | `components/crops/` + `services/crop-service.ts` | Crop creation needs the image's HATEOAS `crops` link (→ `AppImage.capabilities`). Crop editor is a complex overlay (aspect ratio selection, drag-to-crop). No architectural conflict, but the `Image` → `AppImage` migration (Gap 3) is a prerequisite. |
| 8 | **Crops (download links)** | ⚠️ | Same | Kahuna reads `cropsResource.links` for `crop-download-{cropId}-{width}` relations. Needs HATEOAS link traversal. Same prerequisite. |
| 9 | **Leases (CRUD)** | ✅ | `services/lease-service.ts` + `components/leases/` | Clean home. No architectural conflicts. |
| 10 | **Leases (auto from rights)** | ⚠️ | `lib/orchestration/rights-change.ts` | Cross-service: rights change → delete old category leases → create new ones. Needs orchestration that coordinates edit-service and lease-service. |
| 11 | **Image upload** | ✅ | `services/upload-service.ts` + `stores/upload-store.ts` | Two paths (direct-to-S3 + legacy). Job tracking with polling. Clean home. |
| 12 | **Multi-select + batch operations** | ⚠️ | `stores/selection-store.ts` + `components/ActionBar.tsx` | The "core editorial workflow" (philosophy doc). Selection interface too thin (Gap 2). `ActionBar` component (philosophy doc §"Actions Written Once") has no mention in the refactoring plan. |
| 13 | **iframe embedding / postMessage** | ✅ | `lib/embed-mode.ts` + crop event forwarding | No architectural conflicts. `search-orchestration.ts` (or `lib/orchestration/search.ts`) needs an embed-mode guard (suppress logo reset in iframe). |
| 14 | **Drag-and-drop (custom MIME types)** | ✅ | `components/results/` drag handlers | The Phase 3 component split doesn't extract drag logic from ImageGrid/ImageTable, but this is additive — not blocked. |
| 15 | **Usage tracking display** | ✅ | `components/metadata/UsageDisplay.tsx` | Read-only, nested `usages` field. Already in the ES document type. |
| 16 | **Download (original, low-res, crop, zip)** | ⚠️ | `components/ActionBar.tsx` or `services/download-service.ts` | Needs HATEOAS `download` links. Batch zip needs `selection-store.getSelectedImages()`. Same `AppImage` prerequisite. |
| 17 | **Share / copy image link** | ✅ | Trivial — `rootUri` from config + clipboard API | No conflicts. |
| 18 | **Metadata templates** | ✅ | `lib/metadata-templates.ts` + `components/metadata/` | Config-driven. `field-registry.ts` is the right foundation. |
| 19 | **Graphic content blurring** | ✅ | `components/results/` + user preference in `stores/` | `isPotentiallyGraphic` already in Image type. Blur overlay is additive. |
| 20 | **Photoshoot management** | ⚠️ | `services/edit-service.ts` | Same write-coordination pattern as metadata editing. |
| 21 | **Archive / unarchive** | ⚠️ | `services/edit-service.ts` | Same pattern. |
| 22 | **Delete / undelete** | ⚠️ | `services/edit-service.ts` or dedicated | Needs `image.perform('delete')` HATEOAS action. After delete, remove from buffer-store. After undelete, re-fetch and insert. |

**Summary:** 9 features have a clean home. 12 features are workable but need the three amendments (write-service contract, selection interface, AppImage type). 0 features are blocked or made harder. The refactoring plan is safe — it just needs to be more ambitious about preparing for writes.

---

## Part 3: The Missing Principle — Modularity & Extensibility

### The requirement

Grid is open-source. Multiple organisations deploy it (Guardian, BBC, potentially others). Each has:
- **Custom metadata fields** — via `domainMetadataSpecs` in Grid config (already supported by `grid-config.ts` alias fields)
- **Custom workflows** — BBC has different rights categories, different approval flows
- **Custom UI panels** — organisation-specific tools that need to read and act on kupua's state (selected images, search context, focused image)
- **Custom actions** — organisation-specific batch operations

Kahuna handles this minimally: `window._clientConfig` injects per-deployment config, `domainMetadataSpecs` defines custom fields, and the rest is "fork the code." This is insufficient — forks diverge and die.

### What the refactoring plan provides (and doesn't)

**Provides:**
- Clean layer separation — custom panels could import from Layer 2 hooks/stores without pulling in Layer 1 view library code. This is good.
- Store split — custom panels can subscribe to fine-grained slices (`useFocusStore`, `useSelectionStore`) instead of the monolithic search store. This is good.
- DAL abstraction — custom adapters can wrap different backends. This is good.

**Doesn't provide:**
- **No stable public API.** Internal store shape is not a contract. When `buffer-store` is refactored internally, every custom panel that imports it breaks. There's no indirection layer between "kupua internal state" and "what extension panels can rely on."
- **No panel registration.** Custom panels have no way to declare themselves, specify where they appear (left panel, right panel, overlay, toolbar), or declare their state dependencies.
- **No action registration.** Custom actions have no way to add themselves to the ActionBar or declare what they operate on (single image, selection, focused image).
- **No field registry extension point.** `FIELD_REGISTRY` is a hardcoded array. `grid-config.ts` aliases are merged in, but there's no `registerField()` for dynamic registration at runtime.

### Recommendation: Extension surface as a guiding principle

Add **Modularity / Extensibility** as the fourth guiding principle of the refactoring, alongside Three-Layer Separation, Performance Protection, and Separation of Concerns:

> **4. Extension Surface.** Kupua must expose stable, documented APIs that allow third-party panels, actions, and fields to be registered without forking the codebase. The store split and component structure must distinguish between *internal implementation* (can change freely) and *extension contracts* (versioned, stable, documented).

Concrete additions to the refactoring plan:

**Phase 2 amendment — Stable public selectors:**

Create `lib/public-api.ts` (or `extensions/hooks.ts`) that re-exports curated hooks:

```typescript
// extensions/hooks.ts — stable extension API

export { useFocusedImage } from './selectors';
export { useSelectedImages } from './selectors';
export { useSearchContext } from './selectors';
export { useSearchResults } from './selectors';
export { useDensity } from './selectors';
```

These are thin wrappers over internal store selectors. Internal stores can be refactored freely; the public hooks are the stability contract. Extensions import from `@kupua/extensions`, never from internal stores.

**Phase 4 amendment — Extension registration:**

```typescript
// extensions/types.ts

interface PanelRegistration {
  id: string;
  label: string;
  position: 'left' | 'right' | 'bottom';
  /** React component — receives extension hooks as props */
  component: React.ComponentType<ExtensionPanelProps>;
  /** When to show this panel */
  when?: (ctx: ExtensionContext) => boolean;
}

interface ActionRegistration {
  id: string;
  label: string | ((images: AppImage[]) => string);
  icon?: React.ComponentType;
  /** Which images this action operates on */
  target: 'focused' | 'selected' | 'both';
  /** Whether the action is available for the given images */
  enabled?: (images: AppImage[]) => boolean;
  /** Execute the action */
  execute: (images: AppImage[]) => Promise<void>;
}

interface ExtensionPanelProps {
  focusedImage: AppImage | null;
  selectedImages: AppImage[];
  searchContext: SearchContext;
  /** Trigger a search with modified params */
  search: (params: Partial<SearchParams>) => void;
}

interface ExtensionContext {
  focusedImage: AppImage | null;
  selectedImageCount: number;
  density: 'grid' | 'table';
  isImageDetailOpen: boolean;
}
```

```typescript
// extensions/registry.ts

const panels: PanelRegistration[] = [];
const actions: ActionRegistration[] = [];

export function registerPanel(reg: PanelRegistration): void { ... }
export function registerAction(reg: ActionRegistration): void { ... }
export function getRegisteredPanels(position: string): PanelRegistration[] { ... }
export function getRegisteredActions(): ActionRegistration[] { ... }
```

Organisations register extensions in their deployment's entry point:

```typescript
// Example: BBC custom panel
import { registerPanel } from '@kupua/extensions';
import { BbcRightsPanel } from './bbc-rights-panel';

registerPanel({
  id: 'bbc-rights',
  label: 'BBC Rights',
  position: 'right',
  component: BbcRightsPanel,
  when: (ctx) => ctx.selectedImageCount > 0,
});
```

**Cost:** ~1 day to define the types and build the registration skeleton. The actual rendering of extension panels in `PanelLayout.tsx` is a follow-up task.

---

## Part 4: Tensions & Gaps

### Tension 1: Three layers of ES abstraction

After Phase 2, the read path is: `stores → enhanced-es-engine.ts → es-adapter.ts → ES`. When the Grid API arrives, it becomes: `stores → enhanced-es-engine.ts → [GridApiDataSource or es-adapter.ts] → [API or ES]`. The enhanced engine must decide *per method* whether to use ES or the API.

This is manageable but must be explicit. The enhanced engine should accept both adapters at construction time and route per-method based on capability detection:

```typescript
class EnhancedSearchEngine {
  constructor(
    private esAdapter: ElasticsearchDataSource,
    private apiAdapter?: GridApiDataSource,  // undefined until Phase 3
  ) {}

  async seekToPosition(params, offset, signal) {
    if (this.apiAdapter?.supportsSeek) {
      return this.apiAdapter.seek(params, offset, signal);
    }
    // Fall back to ES PIT + percentile estimation
    return this.esSeek(params, offset, signal);
  }
}
```

This avoids a "which adapter am I using?" decision at every call site. The engine encapsulates the routing.

### Tension 2: Store coordination complexity for writes

Six stores communicating via `getState()` + named orchestration functions is manageable for reads (search → buffer → focus → aggregations → ticker). For writes, the coordination is deeper:

```
editMetadata(imageId, patch)
  → edit-service.updateMetadata(imageId, patch)    // API call
  → buffer-store.patchLocalImage(imageId, patch)    // optimistic
  → focus-store.refreshFocusedIfMatch(imageId)      // if focused image was edited
  → selection-store.refreshSelectedIfMatch(imageId)  // if selected image was edited
  → [poll until confirmed]
  → buffer-store.refreshImage(imageId, confirmed)   // replace optimistic with confirmed
  → aggregation-store.invalidate()                  // counts may have changed
```

This is 6 cross-store calls per write. With batch operations (20 images × 6 calls each), the imperative orchestration function becomes 50+ lines of error-prone sequencing.

**Recommendation:** Don't solve this in the refactoring plan — it's a Phase 4/5 concern. But *do* ensure the store split doesn't prevent it. Specifically:
- `buffer-store` must expose `patchLocalImage(id, patch)` and `refreshImage(id, image)`.
- `selection-store` must have `refreshSelectedIfMatch(id)`.
- The orchestration pattern from Step 2.3b must be documented as the *mandatory* pattern for all future workflows (no direct cross-store mutations).

### Tension 3: `Image` type migration

The current `Image` type is ES-document-shaped. The Grid API returns HATEOAS resources. Every store, component, and hook references `Image`. Changing its shape is a codebase-wide refactor.

The refactoring plan doesn't address this. If Phase 2 proceeds with the current `Image` type, every store and component is built around a type that must change again when the Grid API arrives.

**Recommendation:** Introduce `AppImage` during Phase 2 (see Gap 3 in Phase 2 verdict). The cost is a mechanical rename + wrapper, best done *during* the store split when every file is already being touched.

### Tension 4: Degraded UX under the Grid API

`enhanced-es-engine.ts` documents graceful *data* degradation (deep seek → offset pagination capped at 10k, scrubber distribution → seek-only mode). But it doesn't define the *UX* degradation:

| Feature | With ES | With Grid API (no enhancement) | UX impact |
|---|---|---|---|
| Deep seek (>10k) | PIT + percentile estimation (~200ms) | Not available — capped at 10k | Scrubber stops at position 10,000. User can't reach 90% of a 9M result set. |
| Scrubber tooltip | Date histogram / keyword distribution | Not available | Scrubber shows "X of Y" but no date/keyword context. |
| Sort-around-focus | `countBefore` via range query | Binary search over pages | 2–5 second delay instead of <200ms. UX feels broken for fast triage. |
| `search_after` cursors | PIT + cursor-based pagination | `offset/length` (capped at 100k) | Buffer extension stops working at position 100k. |

These are *real product decisions*, not engineering trivia. The scrubber is kupua's signature feature — operating without it would make kupua worse than kahuna for users who browse by scrolling.

**Recommendation:** The refactoring plan should note that `enhanced-es-engine.ts` methods are not just engineering optimisations — they are *product features*. The graceful-degradation documentation should include a UX impact assessment for each method. This informs the Grid API enhancement backlog: which methods *must* become API endpoints vs. which can acceptably degrade.

### Gap: No mention of real-time updates

Kahuna uses polling (`apiPoll`) after every write. The migration plan mentions WebSocket/SSE as a Phase 6 goal. The store split should be designed so that an external event source (WebSocket push of "image X was updated") can update `buffer-store` without going through `search-orchestration.ts`. Currently, `buffer-store` is only updated via search/extend/seek — there's no `injectExternalUpdate(image)` method.

**Recommendation:** Add `buffer-store.injectExternalUpdate(image: AppImage)` to the Phase 2 interface. It can be a no-op initially, but its existence prevents the store from being designed in a way that assumes all updates come from search.

---

## Part 5: Amended Principles

Based on this assessment, the refactoring's guiding principles should be expanded from three to four:

### 1. Three-Layer Separation *(unchanged)*

### 2. Performance Protection *(unchanged)*

### 3. Separation of Concerns *(unchanged)*

### 4. Extension Surface *(new)*

> Kupua must expose stable, documented APIs that allow third-party panels, actions, and fields to be registered without forking the codebase. The distinction between *internal implementation* (can change freely) and *extension contracts* (versioned, stable) must be maintained at the store, hook, and component levels.
>
> Concretely:
> - **Stores** expose public selectors via `extensions/hooks.ts`. Internal store shape is not a public contract.
> - **Panels** can be registered via `extensions/registry.ts` with declared position, visibility conditions, and state dependencies.
> - **Actions** can be registered via the same registry with target type (`focused`, `selected`, `both`), enabled conditions, and execution logic.
> - **Fields** can be registered via `field-registry.ts`'s `registerField()` API for organisation-specific metadata.
> - The **ActionBar** component (philosophy doc §"Actions Written Once") renders both built-in and registered actions, deriving `targetImages` from selection/focus state.

---

## Part 6: Cost Summary

| Amendment | Phase | Additional cost | Impact |
|---|---|---|---|
| Write-path contract stubs in harness | 0 | 30 min | Makes Grid API surface visible |
| Orchestration directory structure | 1 | 0 | Prevents future god module |
| Write-service contract (interfaces only) | 2 | 2–3 hours | Prepares stores for writes |
| `SelectionStore` interface (not just placeholder) | 2 | 1–2 hours | Enables batch operations |
| `AppImage` type wrapper | 2 | 3–4 hours | Prevents type migration later |
| `buffer-store.injectExternalUpdate()` | 2 | 30 min | Enables future real-time |
| Extension types + registry skeleton | 4 | 1 day | Enables third-party panels |
| **Total additional cost** | | **~1.5–2 days** | |
| **Original plan cost** | | **9–14 days** | |
| **Amended plan cost** | | **~11–16 days** | |

---

## Verdict

**Proceed with all five phases.** The plan is well-engineered for its stated goals and creates no obstacles to future work. Apply the six amendments above (+1.5–2 days) to close the write-coordination gap, properly scope multi-select, introduce the AppImage type, and establish the extension surface. The alternative — discovering these gaps during Phase 3 (Grid API integration) or Phase 4/5 (write features) — costs 5–10× more in rework and architectural retrofitting.

The most important single addition is **Gap 3 (AppImage type)** — it touches every file and is cheapest to do during Phase 2 when every file is already being restructured. Doing it later is a second codebase-wide rename.

