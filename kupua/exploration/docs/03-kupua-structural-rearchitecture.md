# Kupua — Structural Rearchitecture Plan

**Authors:** Staff Engineering Manager + Staff Engineers
**Date:** 2 April 2026
**Status:** Proposal — pending team review
**Audience:** Engineering leadership, Staff Engineers, development team. Product as observers.
**Supersedes:** `kupua-structural-audit.md` (findings retained as input, plan replaced)
**Input documents:** `kupua-structural-audit.md`, `refactoring-assessment.md`, `kahuna-service-communication-audit.md`, `KUPUA_CAPABILITIES_REPORT.md`, `extracted-principles.md`, `frontend-philosophy.md`

---

## Executive Summary

Kupua is a fast, well-engineered read-only image browser. It now needs to become a full editorial tool — metadata editing, crops, collections, leases, uploads, batch operations, and extensibility for third-party Grid deployments. The current architecture structurally blocks all of this: it talks to Elasticsearch directly, has no concept of write operations, and has no extension surface.

This document proposes a rearchitecture in 5 phases (~10–14 developer-days) governed by 5 principles. The single most important structural decision is **Principle 5: Service Contracts As-If** — defining typed interfaces for Grid service interactions, shaped as if every backend endpoint already existed. This produces two concrete outcomes: (1) a clear spec of what kupua needs from existing Grid APIs, and (2) a visible backlog of what Grid needs to build. Product and backend engineers can read the contract catalogue and negotiate scope against it.

The structural audit's findings are accepted. Its phased plan is retained as the execution skeleton, amended to close three gaps: write-coordination contracts, multi-select architecture, and the extension surface.

---

## Part A — Five Governing Principles

Every phase, every file move, every new interface must satisfy all five. When principles conflict, their numbering is the tiebreaker.

### Principle 1: Three-Layer Separation

```
┌──────────────────────────────────────────────────────┐
│  Layer 1: VIEW COMPONENTS                            │
│  React + TanStack + Tailwind. Import Layer 2 hooks.  │
│  Swappable by replacing this layer only.             │
├──────────────────────────────────────────────────────┤
│  Layer 2: APPLICATION LOGIC                          │
│  Stores, hooks, orchestration, services.             │
│  Pure TypeScript. Kupua-specific: windowed buffer,   │
│  scroll anchoring, density transitions, selection,   │
│  write coordination. NOT tied to view library or     │
│  data source.                                        │
├──────────────────────────────────────────────────────┤
│  Layer 3: DATA ACCESS                                │
│  Service contracts + adapters + enhanced engine.     │
│  Grid-specific: ES queries, Grid API calls, CQL,    │
│  PIT, auth. Swappable per-service by writing a new   │
│  adapter.                                            │
└──────────────────────────────────────────────────────┘
```

**Decision rule:** When moving code, ask "which layer?" If the answer is ambiguous, the code is doing too much and must be split.

**After rearchitecture:**

| If you swap… | You touch… | You don't touch… |
|---|---|---|
| TanStack Table → AG Grid | Layer 1 | Layers 2, 3 |
| Zustand → Signals | Layer 2 stores | Layer 1 (gets data via hooks), Layer 3 |
| Direct ES → Grid API (reads) | Layer 3 adapter | Layers 1, 2 |
| Add a write service (e.g. metadata-editor) | Layer 3 adapter + Layer 2 orchestration | Layer 1 (gets write status via hooks) |
| Add a third-party panel | Layer 1 component + extension registration | Layers 2, 3 (consumes public API only) |

### Principle 2: Performance Protection

Kupua's core value is speed — virtualised scroll, sub-frame buffer management, 60fps. The rearchitecture must not degrade this.

- **No new render cycles.** Store slices expose fine-grained selectors. Components subscribe only to what they display.
- **No new network round-trips.** Moving code between files does not change the number or timing of requests.
- **No new allocations on the scroll hot path.** Hook extractions are cut-and-paste at the module boundary, not redesigns.
- **Measurable baseline.** Before Phase 1, record: (a) time-to-first-result, (b) extend-forward p95, (c) deep-seek latency. Re-measure after each phase. >10% degradation → investigate before proceeding.

### Principle 3: Separation of Concerns

The three-layer model applied as a decision rule. Each concern has exactly one home:

| Concern | Home | Layer |
|---|---|---|
| ES query construction (`buildSortClause`) | `dal/sort-builders.ts` | 3 |
| Deep seek (PIT + percentile estimation) | `dal/enhanced-es-engine.ts` | 3 |
| Windowed buffer extend/evict | `stores/buffer-store.ts` | 2 |
| Write orchestration (edit → poll → refresh) | `lib/orchestration/edit.ts` | 2 |
| TanStack Table column definitions | `lib/table-columns.ts` | 1/2 boundary |
| Third-party panel registration | `extensions/registry.ts` | 1/2 boundary |

### Principle 4: Extension Surface

Grid is open-source and deployed by multiple organisations. Kupua must expose stable, documented APIs for third-party panels, actions, and fields — without forking.

- **Stores** expose public selectors via `extensions/hooks.ts`. Internal store shape is *not* a public contract.
- **Panels** and **actions** are registered via `extensions/registry.ts` with declared position, visibility conditions, and state dependencies.
- **Fields** are registerable via `field-registry.ts`'s `registerField()` API for organisation-specific metadata.
- The **ActionBar** renders both built-in and registered actions, deriving `targetImages` from selection/focus state.

The extension surface is defined during the rearchitecture (Phase 4) even though third-party consumers don't exist yet. The reason: the extension types *constrain* the store split and component interfaces. Getting them wrong means re-splitting later.

### Principle 5: Service Contracts As-If

**The single most important structural decision.**

Kupua's Layer 3 defines typed interfaces for Grid service interactions, shaped as clean request/response contracts — as if the backend endpoint already existed. This produces two outcomes that are visible to everyone, not just engineers:

1. **"Kupua will connect to these existing APIs — here is exactly what it needs."** Every method tagged `[EXISTS]` maps to a real Grid endpoint. The interface is the integration spec. When a developer starts connecting to media-api, they don't need to reverse-engineer kahuna's AngularJS code — they implement the typed methods, one at a time.

2. **"Grid needs to build these things — here they are, listed."** Every method tagged `[TBD]` is a backend feature request with typed input and output. Product can walk the list with backend engineers and negotiate: build it (kupua gets the full feature), skip it (kupua degrades gracefully or drops the feature), or find a workaround.

#### Should this live in code, or just in documentation?

Both. But not equally, and not all at once.

**In code now (Phase 2):** Two contracts — `ImageSearchService` and `ImageWriteService`. These are the two services that kupua will touch first. `ImageSearchService` because kupua already implements every method via ES and we need to formalise the boundary that keeps collapsing (structural audit Finding 1 — the #1 critical problem). `ImageWriteService` because metadata editing is the first write feature the team will build, and the stub that throws `"not implemented"` is a physical barrier against anyone reaching for direct-ES writes (which would be silently overwritten on reindex).

**In this document for now, entering code when the feature is built:** `CollectionService`, `CropService`, `LeaseService`, `UploadService`, `AuthService`, `BatchOperationService`. These are accurate extractions from the kahuna service audit, but speculative as TypeScript interfaces — we don't know the exact shape of every Grid API response until we integrate. Writing 6 speculative interfaces costs ~3 hours of typing but creates an ongoing maintenance burden: every interface must be kept in sync with this document, and a developer seeing a `.ts` file treats it as more authoritative than a `.md` sketch. The return on that maintenance is zero until someone actually builds the feature.

The pragmatic path: when a developer starts building collections, they read this document's `CollectionService` section, create the `.ts` interface, and adjust it as they discover the actual API shape. The document is the design intent; the code is the implementation truth.

**Cost of the "in code" contracts:** ~3-4 hours for the two interfaces + stubs + wiring into the enhanced engine. Zero runtime cost — TypeScript interfaces compile away, stubs are never called in production. Zero performance impact.

**Relationship to the enhanced engine:** The structural audit's `enhanced-es-engine.ts` (deep seek, PIT, sort distributions) becomes an *implementation detail* behind `ImageSearchService`. The contract says `seekToPosition(params, offset)` → `Promise<BufferPage>`. The enhanced engine implements it via PIT + percentile estimation today. A future Grid API adapter implements it via `POST /images/seek`. Stores never know the difference.

---

## Part B — The Service Contract Catalogue

This section defines service contracts at the interface level. Each maps to one or more Grid microservices. Methods marked **[EXISTS]** have a backend endpoint today. Methods marked **[TBD]** do not — they are the API enhancement backlog.

**Two tiers:**

| Tier | What | When it becomes code | Why |
|---|---|---|---|
| **Tier 1** | `ImageSearchService`, `ImageWriteService` | **Phase 2 of this rearchitecture** | Kupua already implements search; writes are the first new feature. These two contracts prevent the DAL boundary from collapsing again. |
| **Tier 2** | `CollectionService`, `CropService`, `LeaseService`, `UploadService`, `AuthService`, `BatchOperationService` | **When a developer starts building that feature** | Accurate design intent, but speculative as code. Enters code as a `.ts` interface file when someone needs to import it. |

---

### Tier 1 — In Code During Phase 2

#### B.1 ImageSearchService

Maps to: `media-api` (search, retrieval, count) + kupua's enhanced ES engine for `[TBD]` methods.

**Two interfaces, composed:**

The search contract is split into a **core** (what the Grid API can serve today) and the **full service** (what stores consume). The enhanced engine bridges the gap:

```
ImageDataSource (4 methods)          ← Grid API adapter implements this
       │
       ▼
EnhancedSearchEngine(core)           ← wraps core, adds [TBD] methods via ES
       │
       ▼
ImageSearchService (9 methods)       ← stores import this
```

`ImageDataSource` is not a sub-interface of `ImageSearchService` — it's the *constructor input* to the enhanced engine. This keeps "what Grid API must implement" (4 methods) visually distinct from "what kupua uses" (9 methods) without inheritance.

```typescript
/** What the Grid API adapter needs to implement. */
interface ImageDataSource {
  search(params: SearchParams, signal?: AbortSignal): Promise<SearchResult>;
  getById(id: string, signal?: AbortSignal): Promise<Image | undefined>;
  count(params: SearchParams, signal?: AbortSignal): Promise<number>;
  getAggregations(
    params: SearchParams,
    fields: AggregationField[],
    signal?: AbortSignal,
  ): Promise<AggregationsResult>;
}

/** What stores and orchestration consume. Superset of ImageDataSource. */
interface ImageSearchService {
  /** Search images with full CQL + filters + sorting.
   *  [EXISTS] GET /images?q=…&offset=…&length=… */
  search(params: SearchParams, signal?: AbortSignal): Promise<SearchResult>;

  /** Fetch a single image by ID.
   *  [EXISTS] GET /images/{id} */
  getById(id: string, signal?: AbortSignal): Promise<Image | undefined>;

  /** Count matching images (no hits returned).
   *  [EXISTS] GET /images?countAll=true&length=0 */
  count(params: SearchParams, signal?: AbortSignal): Promise<number>;

  /** Aggregations for facet filters.
   *  [TBD] No dedicated endpoint — today: ES terms aggs directly.
   *  Candidate: GET /images/aggregations?fields=…&q=… */
  getAggregations(
    params: SearchParams,
    fields: AggregationField[],
    signal?: AbortSignal,
  ): Promise<AggregationsResult>;

  /** Seek to a global offset, returning a page with cursors.
   *  [TBD] Today: PIT + percentile estimation + search_after.
   *  Candidate: POST /images/seek { offset, length, sort, query } */
  seekToPosition(
    params: SearchParams,
    globalOffset: number,
    signal?: AbortSignal,
  ): Promise<BufferPage>;

  /** Extend forward from a cursor.
   *  [TBD] Today: search_after with PIT.
   *  Candidate: GET /images?cursor=…&length=… */
  extendForward(
    params: SearchParams,
    cursor: Cursor,
    signal?: AbortSignal,
  ): Promise<BufferPage>;

  /** Extend backward from a cursor.
   *  [TBD] Today: reverse search_after with PIT.
   *  Candidate: GET /images?cursorBefore=…&length=… */
  extendBackward(
    params: SearchParams,
    cursor: Cursor,
    signal?: AbortSignal,
  ): Promise<BufferPage>;

  /** Count documents before a sort position (for sort-around-focus).
   *  [TBD] Candidate: GET /images/countBefore?sort=…&anchor=…&q=… */
  countBefore(
    params: SearchParams,
    sortPosition: SortAnchor,
    signal?: AbortSignal,
  ): Promise<number>;

  /** Sort-field distribution for scrubber tooltip display.
   *  [TBD] Candidate: GET /images/sortDistribution?field=…&q=… */
  getSortDistribution(
    params: SearchParams,
    field: string,
    direction: 'asc' | 'desc',
    signal?: AbortSignal,
  ): Promise<SortDistribution | null>;
}
```

**Implementation today:** `ElasticsearchSearchService` — wraps `es-adapter.ts` + the enhanced engine. Every method works.

**Implementation when Grid API connects:** `GridApiSearchService` — implements `search`, `getById`, `count` via media-api HTTP calls. `[TBD]` methods either delegate to a new API endpoint (if built) or fall back to the ES implementation via the enhanced engine.

#### B.2 ImageWriteService

Maps to: `metadata-editor` (edits-api).

```typescript
interface ImageWriteService {
  /** Update one or more metadata fields on an image.
   *  [EXISTS] PUT /edits/metadata (via HATEOAS link on image resource) */
  updateMetadata(imageId: string, patch: MetadataPatch): Promise<WriteResult>;

  /** Set usage rights category + properties. Triggers auto-lease management.
   *  [EXISTS] PUT /edits/usageRights (via HATEOAS link) */
  setUsageRights(imageId: string, rights: UsageRights): Promise<WriteResult>;

  /** Add labels to an image.
   *  [EXISTS] POST /edits/labels (via HATEOAS link) */
  addLabels(imageId: string, labels: string[]): Promise<WriteResult>;

  /** Remove a label.
   *  [EXISTS] DELETE /edits/labels/{labelUri} */
  removeLabel(imageId: string, labelUri: string): Promise<WriteResult>;

  /** Set/clear photoshoot.
   *  [EXISTS] PUT/DELETE /edits/photoshoot */
  setPhotoshoot(imageId: string, title: string | null): Promise<WriteResult>;

  /** Set archived status.
   *  [EXISTS] PUT /edits/archived */
  setArchived(imageId: string, archived: boolean): Promise<WriteResult>;

  /** Delete an image (soft delete).
   *  [EXISTS] DELETE /images/{id} (via HATEOAS action) */
  deleteImage(imageId: string): Promise<WriteResult>;

  /** Undelete an image.
   *  [EXISTS] PUT /images/undelete/{id} */
  undeleteImage(imageId: string): Promise<WriteResult>;

  /** Get available usage rights categories.
   *  [EXISTS] GET /edits/usage-rights-list */
  getUsageRightsCategories(): Promise<UsageRightsCategory[]>;
}

interface WriteResult {
  /** Resolves when the backend confirms the write (ES reindexed). */
  confirmed: Promise<Image>;
  /** Abort the confirmation poll (user navigated away). */
  abort: () => void;
}
```

**Why `WriteResult` has no `optimistic` field:** Optimistic local display is a UI concern, not a service contract concern. The orchestration function handles it:

```typescript
// lib/orchestration/edit.ts (future, not built during rearchitecture)
async function editMetadata(imageId: string, patch: MetadataPatch) {
  bufferStore.patchLocalImage(imageId, patch);       // ← optimistic, immediate
  const result = writeService.updateMetadata(imageId, patch);
  const confirmed = await result.confirmed;          // ← poll until reindexed
  bufferStore.refreshImage(imageId, confirmed);      // ← replace optimistic with truth
}
```

The API doesn't return an optimistic value — kupua *constructs* it locally from the patch. Keeping this in the orchestration layer (not the service contract) means the write service stays a clean API wrapper.

**Implementation today:** `StubImageWriteService` — every method throws `"not implemented"`. This is the *point*: the interface exists, the backend mapping is documented, and anyone reading the code knows exactly what's missing.

**Implementation when Grid API connects:** `GridApiImageWriteService` — each method calls the documented endpoint, then polls `getById()` until the change is reflected (the `apiPoll` / `getSynced` pattern from kahuna).

**Where things live (applies to all services):**
- **Contract interfaces** → `dal/contracts/` — what the service does (types only, no implementation)
- **Adapters** → `dal/adapters/` — how it does it (ES adapter, Grid API adapter, stubs)
- **Workflow orchestration** → `lib/orchestration/` — multi-store coordination that uses the service (e.g. `edit.ts`: patch buffer → call write service → poll → refresh)
- **Shared write infrastructure** → `services/` — reusable patterns like poll-until-confirmed (future, when first write feature is built)

### Tier 2 — Documented Here, Enters Code When Feature Is Built

> These interfaces are design intent — extracted from the kahuna service audit, accurate to the current Grid API. They become `.ts` files when a developer starts building the feature. Until then, this document is the reference.

#### B.3 CollectionService

Maps to: `collections` microservice.

```typescript
interface CollectionService {
  /** Get the full collection tree.
   *  [EXISTS] GET /collections */
  getTree(signal?: AbortSignal): Promise<CollectionNode>;

  /** Create a new collection (top-level or child).
   *  [EXISTS] POST /collections or POST /collections/{nodeId}/children */
  createCollection(parentPath: string | null, name: string): Promise<CollectionNode>;

  /** Delete a collection node.
   *  [EXISTS] DELETE /collections/{nodeId} */
  deleteCollection(nodeId: string): Promise<void>;

  /** Add images to a collection.
   *  [EXISTS] POST /images/{id}/collections (per image, via HATEOAS action) */
  addImages(collectionPath: string, imageIds: string[]): Promise<WriteResult>;

  /** Remove images from a collection.
   *  [EXISTS] DELETE /images/{id}/collections/{collectionId} (per image) */
  removeImages(collectionPath: string, imageIds: string[]): Promise<WriteResult>;
}
```

#### B.4 CropService

Maps to: `cropper` microservice.

```typescript
interface CropService {
  /** Create a sized crop.
   *  [EXISTS] POST /cropper/crop { type:'crop', source, x, y, w, h, aspectRatio } */
  createCrop(imageId: string, spec: CropSpec): Promise<WriteResult>;

  /** Create a full-size export (no cropping).
   *  [EXISTS] POST /cropper/crop { type:'full', source } */
  createFullExport(imageId: string): Promise<WriteResult>;

  /** Get existing crops for an image.
   *  [EXISTS] GET /images/{id}/crops (via HATEOAS link) */
  getCrops(imageId: string, signal?: AbortSignal): Promise<CropResource[]>;

  /** Delete all crops for an image.
   *  [EXISTS] DELETE /images/{id}/crops (via HATEOAS action) */
  deleteAllCrops(imageId: string): Promise<void>;
}
```

#### B.5 LeaseService

Maps to: `leases` microservice.

```typescript
interface LeaseService {
  /** Add a lease to an image.
   *  [EXISTS] POST /images/{id}/leases (via HATEOAS action) */
  addLease(imageId: string, lease: LeaseSpec): Promise<WriteResult>;

  /** Add multiple leases at once.
   *  [EXISTS] POST /images/{id}/leases (bulk, via HATEOAS action) */
  addLeases(imageId: string, leases: LeaseSpec[]): Promise<WriteResult>;

  /** Replace all leases on an image.
   *  [EXISTS] PUT /images/{id}/leases (via HATEOAS action) */
  replaceLeases(imageId: string, leases: LeaseSpec[]): Promise<WriteResult>;

  /** Delete all leases from an image.
   *  [EXISTS] DELETE /images/{id}/leases (via HATEOAS action) */
  deleteAllLeases(imageId: string): Promise<void>;

  /** Delete a specific lease by ID.
   *  [EXISTS] DELETE /leases/{leaseId} */
  deleteLease(leaseId: string): Promise<void>;

  /** Get current leases for an image.
   *  [EXISTS] GET /leases/by-media-id/{id} */
  getLeases(imageId: string, signal?: AbortSignal): Promise<Lease[]>;
}
```

#### B.6 UploadService

Maps to: `image-loader` microservice.

```typescript
interface UploadService {
  /** Upload a file (direct-to-S3 path).
   *  [EXISTS] POST /loader/prepare → PUT to S3 → POST /loader/uploadStatus */
  uploadFile(file: File, onProgress?: (pct: number) => void): Promise<UploadResult>;

  /** Import an image from a URL.
   *  [EXISTS] POST /loader/import { uri, identifiers } */
  importUri(uri: string, identifiers?: Record<string, string>): Promise<UploadResult>;

  /** Get upload status.
   *  [EXISTS] GET /loader/uploadStatus/{id} */
  getUploadStatus(mediaId: string, signal?: AbortSignal): Promise<UploadStatus>;
}
```

#### B.7 AuthService

Maps to: `auth` service + `media-api` session endpoint.

```typescript
interface AuthService {
  /** Get current user session. Returns null if not authenticated.
   *  [EXISTS] GET /session (via media-api root) */
  getSession(signal?: AbortSignal): Promise<UserSession | null>;

  /** Redirect to login page.
   *  [EXISTS] authUri + '/login?redirectUri=…' */
  redirectToLogin(returnUrl: string): void;

  /** Check if current user has a specific permission.
   *  Derived from session data — no extra HTTP call. */
  hasPermission(permission: string): boolean;
}
```

#### B.8 BatchOperationService

Maps to: no single backend service — orchestrates multiple services with progress tracking.

```typescript
interface BatchOperationService {
  /** Execute a write operation across multiple images with progress.
   *  [TBD] Today: sequential loop with per-image polling (kahuna pattern).
   *  Candidate future: POST /batch/edit { imageIds, patch } (single endpoint) */
  executeBatch<T>(
    imageIds: string[],
    operation: (imageId: string) => Promise<WriteResult>,
    onProgress?: (completed: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<BatchResult>;
}

interface BatchResult {
  succeeded: string[];     // image IDs
  failed: { id: string; error: string }[];
}
```

**Why this matters:** This is the contract that makes a future "mass-edits service" tangible. Backend engineers can look at `executeBatch` and decide: should this be a single-endpoint bulk operation, or should the frontend orchestrate per-image calls? The interface supports both — the implementation decides.

### Summary: The Backend Backlog

| Service | Total methods | [EXISTS] today | [TBD] — backend must build or kupua degrades |
|---|---|---|---|
| ImageSearchService | 9 | 3 (search, getById, count) | 6 (aggregations, seek, extend×2, countBefore, sortDistribution) |
| ImageWriteService | 10 | 10 | 0 |
| CollectionService | 5 | 5 | 0 |
| CropService | 4 | 4 | 0 |
| LeaseService | 6 | 6 | 0 |
| UploadService | 3 | 3 | 0 |
| AuthService | 3 | 2 (session, login) | 0 (permissions derived) |
| BatchOperationService | 1 | 0 | 1 (candidate for dedicated service) |
| **Total** | **41** | **33** | **7** |

**33 of 41 methods have existing backend endpoints.** The 7 `[TBD]` methods are all read-path optimisations (search service) plus the batch endpoint. Every write feature has a working backend today. The bottleneck is frontend integration, not backend availability.

---

## Part C — The AppImage Question

The current `Image` type mirrors ES `_source` document shape. The Grid API returns HATEOAS resources with `data`, `links`, and `actions`. Every store, component, and hook references `Image`. The assessment document proposed introducing `AppImage` during Phase 2 to avoid a later codebase-wide rename.

### Honest assessment: defer it.

The `AppImage` wrapper adds a level of indirection (`image.data.metadata` vs `image.metadata`) across ~50 files for a benefit that only materialises when the Grid API adapter ships. That adapter is Phase 3+ of the migration plan — months away. Between now and then:

- Every developer writes `image.data.metadata.credit` instead of `image.metadata.credit`. Hundreds of times. Marginal but real friction.
- The `capabilities` field is `undefined` everywhere (kupua is read-only via ES). No component can use it. It's dead code until auth + Grid API exist.
- The rename is mechanical (find/replace `image.metadata` → `image.data.metadata`). Tedious but safe. IDE refactoring tools handle it in minutes. The risk of doing it later is low.

**What costs more:** doing a mechanical rename later (1–2 hours with IDE tooling, low risk) or carrying an abstraction wrapper through 50 files for months that no code path exercises (ongoing cognitive cost, no benefit until Grid API).

**Recommendation:** Keep the current `Image` type during this rearchitecture. Document the `AppImage` design in this section so it's ready when Grid API integration begins. When that work starts, introduce `AppImage` as the first step — at which point the wrapper is immediately useful because `capabilities` is populated from HATEOAS links.

### The design (for when it's needed)

```typescript
/** The unified image type consumed by all of kupua. */
interface AppImage {
  /** Image data — same field structure regardless of source (ES or API). */
  data: ImageData;

  /** Capabilities — what the current user can do with this image.
   *  Populated from HATEOAS links/actions when loaded via Grid API.
   *  Undefined when loaded via ES (no permission info available). */
  capabilities?: ImageCapabilities;
}

interface ImageCapabilities {
  canEdit: boolean;
  canCrop: boolean;
  canDelete: boolean;
  canArchive: boolean;
  editUri?: string;
  cropsUri?: string;
  downloadUri?: string;
  leasesUri?: string;
}
```

Components will use `capabilities` to conditionally render action buttons. When `capabilities` is undefined (ES-only mode), write actions are hidden. When populated (Grid API mode), actions appear automatically.

---

## Part D — Extension Surface

> **Note on types:** The extension API below uses `AppImage` because it describes the *target design* — the stable public contract that extensions will code against. During Phase 2/4, the actual implementation uses the current `Image` type. When Grid API integration introduces `AppImage` (Part C), the extension hooks automatically resolve to the richer type. No extension code changes.

### D.1 Public API (Stable Selectors)

Extensions import from `extensions/hooks.ts`, never from internal stores:

```typescript
// extensions/hooks.ts — stable public API for panels, actions, and third-party code

export function useFocusedImage(): AppImage | null;
export function useSelectedImages(): AppImage[];
export function useSearchContext(): { query: string; total: number; params: SearchParams };
export function useSearchResults(): AppImage[];   // current buffer
export function useDensity(): 'grid' | 'table';
export function useIsImageDetailOpen(): boolean;
```

These are thin wrappers over internal store selectors. Internal stores can be refactored freely; these hooks are the stability contract.

### D.2 Panel Registration

```typescript
// extensions/types.ts

interface PanelRegistration {
  id: string;
  label: string;
  position: 'left' | 'right';
  component: React.ComponentType<ExtensionPanelProps>;
  when?: (ctx: ExtensionContext) => boolean;
}

interface ExtensionPanelProps {
  focusedImage: AppImage | null;
  selectedImages: AppImage[];
  searchContext: SearchContext;
  /** Trigger a search with modified params */
  search: (params: Partial<SearchParams>) => void;
}
```

### D.3 Action Registration

```typescript
interface ActionRegistration {
  id: string;
  label: string | ((images: AppImage[]) => string);  // "Delete" or "Delete 5 images"
  icon?: React.ComponentType;
  target: 'focused' | 'selected' | 'both';
  enabled?: (images: AppImage[]) => boolean;
  execute: (images: AppImage[]) => Promise<void>;
}
```

### D.4 Field Registration

```typescript
// Added to field-registry.ts
function registerField(field: FieldDefinition): void;
function registerFields(fields: FieldDefinition[]): void;
```

Organisations register custom fields in their deployment entry point. Fields appear in the table, metadata panel, and facet filters automatically.

---

## Part E — Phased Execution Plan

The structural audit's 5-phase skeleton is retained. Amendments from the assessment are incorporated. This section describes *what* changes per phase, not line-by-line implementation.

### Phase 0: Testing Harness (0.5–1 day)

**Goal:** Safety net for all subsequent phases.

**Retained from audit:** DAL contract tests, visual regression screenshots, sort-around-focus position test, perf baseline recording.

**Added:**
- Write-path contract stubs in the DAL contract suite — every `ImageWriteService` method throws `"not implemented"`. Makes the Grid API surface visible from day one.

### Phase 1: Extract Imperative Services (2–3 days)

**Goal:** Fix circular dependencies. Establish Layer 2 as distinct from Layer 1.

**Retained from audit:** Extract `cancelSearchDebounce`, `resetScrollAndFocusSearch`, scroll-container registration from components into `lib/`. Create `resetToHome()`. Update all imports.

**Amended:**
- `search-orchestration.ts` → `lib/orchestration/search.ts`. Create `lib/orchestration/` as a directory with a README documenting the pattern: one file per workflow domain. Future files (`edit.ts`, `upload.ts`, `collection.ts`) are listed but not created.

**Validation:** Zero cross-component imperative imports. Perf baseline unchanged.

### Phase 2: Service Contracts + Store Split + DAL (3–5 days)

**Goal:** Define the two most important service contracts in code. Split the monolithic store. Rehabilitate the DAL. The heaviest phase, but the one that pays for everything after.

**Step 2.1 — Define Tier 1 service contracts in code**

Create `dal/contracts/` with three files:

| File | Interface | Methods | Role |
|---|---|---|---|
| `data-source.ts` | `ImageDataSource` | 4 methods | What the Grid API adapter implements |
| `search-service.ts` | `ImageSearchService` | 9 methods (see Part B.1) | What stores consume (superset of DataSource) |
| `write-service.ts` | `ImageWriteService` | 10 methods (see Part B.2) | What write orchestration consumes |

Each method has: typed request/response, `[EXISTS]` or `[TBD]` JSDoc tag, Grid API endpoint it maps to.

Create `dal/stubs/stub-write-service.ts` — every `ImageWriteService` method throws `"not implemented"`. This is the physical barrier against direct-ES writes.

The remaining 6 service contracts (Tier 2) stay in this document. They enter code as `.ts` files when a developer starts building that feature.

**Step 2.2 — Create the enhanced engine behind `ImageSearchService`**

The structural audit's `enhanced-es-engine.ts` becomes an implementation detail of `ElasticsearchSearchService`. It implements the `[TBD]` methods (seek, extend, countBefore, sortDistribution) using ES primitives. Stores never import it directly — they import `ImageSearchService`.

PIT lifecycle is encapsulated as an opaque session inside the engine. `buffer-store` never sees a PIT ID.

**Step 2.3 — Split the monolithic store**

| New store | Responsibility | Layer |
|---|---|---|
| `search-store.ts` | Query params, `setParams()`, URL sync | 2 |
| `buffer-store.ts` | Windowed buffer, extend, seek, cursors. Consumes `ImageSearchService`. Exposes `patchLocalImage()` and `refreshImage()` for future write support. | 2 |
| `aggregation-store.ts` | Facet aggregations, circuit breaker, expanded aggs | 2 |
| `focus-store.ts` | `focusedImageId`, sort-around-focus | 2 |
| `selection-store.ts` | `SelectionSet` — see below | 2 |
| `ticker-store.ts` | New-images polling | 2 |
| `sort-distribution-store.ts` | Scrubber tooltip distribution, cache | 2 |

Existing `column-store.ts` and `panel-store.ts` are untouched.

**Step 2.3-ext — Create `extensions/hooks.ts` (stable public selectors)**

Created during Phase 2 alongside the store split — not deferred to Phase 4. Reason: the store interfaces should be designed with the public API in mind from the start. These are 6 one-liner functions wrapping internal store selectors:

```typescript
// extensions/hooks.ts
export const useFocusedImage = () => useFocusStore(s => s.focusedImage);
export const useSelectedImages = () => useSelectionStore(s => s.getSelectedImages());
export const useSearchContext = () => useSearchStore(s => ({ query: s.params.query, total: s.total, params: s.params }));
export const useSearchResults = () => useBufferStore(s => s.results);
export const useDensity = () => useSearchStore(s => s.params.density ?? 'grid');
export const useIsImageDetailOpen = () => useSearchStore(s => !!s.params.image);
```

Phase 4 adds the *registration machinery* (panel/action types, registry, README). The data access layer for extensions ships with the store split.

**Step 2.3a — `SelectionStore` interface**

Selection is the foundation of batch operations — the "core editorial workflow." The interface must be defined now, even if the body is minimal:

```typescript
interface SelectionStore {
  selectedIds: Set<string>;
  toggle(id: string): void;
  rangeSelect(fromId: string, toId: string, orderedIds: string[]): void;
  selectAll(visibleIds: string[]): void;
  clear(): void;
  /** Called by search orchestration when results change — drops non-surviving IDs silently. */
  reconcileWithResults(survivingIds: Set<string>): void;
  /** For ActionBar and batch operations. */
  getSelectedImages(): Image[];
}
```

**Step 2.3b — Tuning constants consolidation**

`BUFFER_CAPACITY`, `PAGE_SIZE`, `DEEP_SEEK_THRESHOLD`, etc. → `constants/tuning.ts`. Coupling relationships documented as JSDoc.

**Step 2.3c — Store-to-store coordination**

Multi-store sequences are coordinated via named orchestration functions in `lib/orchestration/search.ts`:

```typescript
async function executeSearch(params: SearchParams) {
  searchStore.setParams(params);
  const results = await bufferStore.fetchInitialPage(params);
  focusStore.resolveAfterSearch(results);
  selectionStore.reconcileWithResults(new Set(results.hits.map(h => h.id)));
  aggregationStore.triggerAggregations(params);
  tickerStore.resetPoll(params);
}
```

This is explicit imperative coordination. Individual stores do not subscribe to each other's state changes.

**Step 2.3d — Split `sort-context.ts`**

ES sort clause builders → `dal/sort-builders.ts` (Layer 3). Sort display/label logic → `lib/sort-context.ts` (Layer 2).

**Validation:** DAL contract tests pass against trimmed interface. Store transition snapshots match. Perf baseline unchanged or improved (finer subscriptions → fewer re-renders).

### Phase 3: Split Components + Hooks (2–3 days)

**Goal:** Make files individually comprehensible. Enforce the Layer 1 / Layer 2 boundary within view code.

**Retained from audit:**
- `useScrollEffects` (691 lines) → 4 focused hooks: `useScrollReset`, `useScrollCompensation`, `useDensityTransition`, `useEdgeDetection`.
- `ImageTable.tsx` (1,301 lines) → core ~600 lines + 5 extractions (column defs, text measurement, sort interaction, horizontal scroll proxy, cell click-to-search).
- `Scrubber.tsx` (948 lines) → core ~400 lines + 3 extractions (tooltip, track ticks, interaction state machine).
- Scrubber data computation out of `routes/search.tsx` → `hooks/useScrubberData.ts`.

**No amendments.** The audit's Phase 3 is well-specified and low-risk.

### Phase 4: Feature Homes + Extension Surface (1–1.5 days)

**Goal:** Create directory structure for upcoming features and the extension registration skeleton.

**End-state directory structure after all phases.** Annotations show which phase creates each item.

```
src/
  components/
    search/           ← [P4] SearchBar, CqlSearchInput, SearchFilters, SearchPill, DateFilter, StatusBar
    results/          ← [P3] ImageGrid, ImageTable, ColumnContextMenu, HorizontalScrollProxy
    detail/           ← [P4] ImageDetail
    metadata/         ← [P4] ImageMetadata
    scrubber/         ← [P3] Scrubber, ScrubberTooltip, TrackTicks
    layout/           ← [P4] PanelLayout, ErrorBoundary, ActionBar
    facets/           ← [P4] FacetFilters
    icons/            ← [P4] SearchIcon, ChevronIcon, PanelIcon, SortArrow
    [future: edits/, collections/, crops/, uploads/, leases/]
  dal/
    contracts/            ← [P2] ImageDataSource (4 methods), ImageSearchService (9), ImageWriteService
                          ← Tier 2 enters here when features are built
    adapters/
      elasticsearch/      ← [P2] ES adapter + enhanced engine + sort builders
      stubs/              ← [P2] StubImageWriteService (throws "not implemented")
      [future: grid-api/] ← Grid API adapters (one per service)
    es-config.ts          ← [existing]
    types.ts              ← [P2] Cursor, BufferPage, WriteResult, shared DAL types
  stores/
    search-store.ts           ← [P2] Query params only
    buffer-store.ts           ← [P2] Windowed buffer (with patchLocalImage, refreshImage)
    aggregation-store.ts      ← [P2]
    focus-store.ts            ← [P2]
    selection-store.ts        ← [P2] SelectionSet interface
    ticker-store.ts           ← [P2]
    sort-distribution-store.ts ← [P2]
    column-store.ts           ← [existing, unchanged]
    panel-store.ts            ← [existing, unchanged]
    [future: collection-store.ts, upload-store.ts]
  extensions/
    hooks.ts              ← [P2] Stable public selectors (useFocusedImage, useSelectedImages, etc.)
    types.ts              ← [P4] PanelRegistration, ActionRegistration, ExtensionPanelProps
    registry.ts           ← [P4] registerPanel(), registerAction(), getRegistered*()
    README.md             ← [P4] Extension API documentation
  lib/
    orchestration/
      search.ts           ← [P1] Search, seek, sort-around-focus coordination
      README.md           ← [P1] Pattern documentation
      [future: edit.ts, upload.ts, collection.ts, crop.ts]
    reset-to-home.ts      ← [P1]
    field-registry.ts     ← [existing, registerField() added P4]
    sort-context.ts       ← [P2] Layer 2 only (ES sort builders moved to dal/)
    table-columns.ts      ← [P3]
    measure-text.ts       ← [P3]
    cql.ts                ← [existing]
    ...existing lib files...
  hooks/
    useScrollReset.ts         ← [P3]
    useScrollCompensation.ts  ← [P3]
    useDensityTransition.ts   ← [P3]
    useEdgeDetection.ts       ← [P3]
    useSortInteraction.ts     ← [P3]
    useCellClickSearch.ts     ← [P3]
    useScrubberInteraction.ts ← [P3]
    useScrubberData.ts        ← [P3]
    useDataWindow.ts          ← [existing]
    useUrlSearchSync.ts       ← [existing, trimmed P1]
    ...existing hooks...
  services/
    README.md             ← [P4] Documents the write-coordinator pattern
    [future: write-coordinator.ts — shared poll-until-confirmed logic]
  types/
    image.ts              ← [existing] Image type (AppImage deferred — see Part C)
    scroll.ts             ← [P3]
    ...existing...
  constants/
    tuning.ts             ← [P2]
```

**Validation:** `npm run build` succeeds. All tests pass. Perf baseline unchanged.

---

## Part F — Risk Assessment

| Risk | Without rearchitecture | With rearchitecture |
|---|---|---|
| **"What backend endpoints do we need?"** — product asks, nobody knows | High — knowledge trapped in 1,800-line store + tribal memory | **Low — read the contract catalogue.** 41 methods, 33 exist, 7 TBD. Two contracts in code, six documented in the plan. |
| **Grid API integration stalls** — DAL boundary defeated | High — must rewrite store, seek, sort, CQL | Low — implement contract interface methods one at a time |
| **New service needed** (e.g. batch-edits) | High — no spec for what frontend needs | Low — `BatchOperationService` interface already defines input/output |
| **Third-party org needs custom panel** | Impossible — no extension surface | Feasible — register panel, consume public hooks |
| **Performance degrades during rearchitecture** | Medium — no baseline | Low — perf baseline measured each phase |
| **Parallel feature work blocked** | High — serialised on one mega-store | Low — 7 independent store slices + contract interfaces |
| **New developer onboarding** | 2–4 weeks (1,800-line store, 1,301-line component) | ~1 week (each file ≤400 lines, clear contracts) |

---

## Part G — What This Plan Does NOT Cover

These are explicitly out of scope. They are real concerns but belong in separate documents:

1. **Detailed code-change instructions.** This plan says *what* to build and *where* it goes, not the line-by-line implementation.
2. **Grid API adapter implementation.** That's Phase 3+ of the migration plan. This rearchitecture *prepares* for it by defining the contracts.
3. **Degraded UX under the Grid API.** When `[TBD]` methods have no backend endpoint, some features (deep seek, scrubber tooltips) will operate in a reduced mode. The specific UX for each degradation is a product decision, not an architecture decision. It can be negotiated per-method against the contract catalogue.
4. **Timeline/sprint allocation.** This plan estimates developer-days per phase. Scheduling is a team decision.
5. **The actual write features** (metadata editing UI, crop editor, collection tree, upload page). Those are feature specs, not architecture. This plan gives them a clean home.

---

## Part H — Phase Summary

| Phase | Days | Risk | Key deliverable |
|---|---|---|---|
| **0: Testing Harness** | 0.5–1 | Low | DAL contract tests + write-path stubs + perf baseline |
| **1: Extract Services** | 2–3 | Low | Zero cross-component imperative imports; orchestration directory |
| **2: Contracts + Store + DAL** | 3–5 | Medium | 2 service contracts in code (search + writes), 6 documented, 7 store slices, enhanced engine behind contract, extension public hooks |
| **3: Split Components** | 2–3 | Low | All files ≤600 lines, 4 scroll hooks, 8 component extractions |
| **4: Feature Homes + Extensions** | 1–1.5 | None | Directory structure, extension registration (panel/action types + registry), field registration API |
| **Total** | **~10–14 days** | | |

---

## Appendix: How to Read the Contract Catalogue

For **product:** Look at the Summary table in Part B. The `[TBD]` column is your backend investment backlog. Each `[TBD]` method has a "Candidate" endpoint — that's what the backend team would need to build. You can negotiate: build it (kupua gets the full feature), skip it (feature degrades), or find a workaround. The `[EXISTS]` methods are what kupua will connect to — the integration spec.

For **backend engineers:** Two service contracts are TypeScript files in `dal/contracts/` — `ImageSearchService` and `ImageWriteService`. Six more are documented in Part B of this plan and will enter code when the feature is built. The method signatures are your API spec. `[EXISTS]` = endpoints you already maintain. `[TBD]` = feature requests with typed input/output.

For **frontend developers:** You code against the contract interfaces. `ImageSearchService` is already implemented by the ES adapter. `ImageWriteService` has a stub that throws — when Grid API integration starts, you implement the methods one at a time. When a new feature needs a Tier 2 contract (collections, crops, etc.), create the `.ts` interface file from Part B of this document, build a stub, then implement the adapter.

For **third-party integrators:** Import from `extensions/hooks.ts`. Register panels via `extensions/registry.ts`. Never import from internal stores or `dal/adapters/`. The extension API is your stability contract.


























