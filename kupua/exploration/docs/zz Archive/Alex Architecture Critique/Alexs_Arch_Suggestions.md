# Alex's Arch Suggestions

## Core rules

**1. No ES primitives in the UI except as opaque types.**
The UI should not know that Elasticsearch exists. If an ES concept must cross the DAL boundary, it travels as a named opaque type — inspectable only inside the DAL.

**2. If an ES detail is essential, it must be specifically revealed.**
Not leaked by accident (a raw array, a string with a `-` prefix convention, a field path). Deliberately surfaced as a typed, named concept with a domain name. Every crossing of the boundary is a conscious decision, visible at the type level.

**3. All orchestration lives in the DAL.**
The decision of when to call ES, in what sequence, with what parameters, and how to combine results is DAL business. Hooks and components express intent — `seek(id)`, `selectRange(a, b)`, `getPosition(id)` — and the DAL does the work.

**4. The DAL maps ES documents to domain objects. Raw ES results do not leave the DAL.**
Every ES `_source` document the DAL touches must be mapped to a typed domain object before it is returned. ES response envelope fields — `took`, `_shards`, `pit_id`, `_id`, `_score`, `sort` — are internal to the DAL. Nothing outside `dal/` should see an ES response shape.

**5. Kupua is a full-stack JS application. The browser never touches the cluster.**
The BFF (kupua's Node server) is the only ES client. There is no browser-to-Elasticsearch path in any environment. The Vite dev proxy's `/es` rule is a local development shortcut that must be replaced by BFF API routes before the app is production-worthy — it is not a security model.

The architecture is:

```
Browser (React)  →  Kupua BFF (Node)  →  Elasticsearch
                                       →  media-api
                                       →  collections service
```

All ES knowledge — query building, filter logic, PIT lifecycle, cursor encoding, aggregation walks — lives in the BFF. The browser imports nothing from `dal/es*`. The browser's DAL is a thin typed HTTP client calling BFF routes.

---

## Cursor

`SortValues = (string | number | null)[]` is an ES `search_after` array. Nothing outside the DAL should index into it, map over it, or know its shape.

Replace with an opaque type:

```ts
// dal/types.ts
declare const cursorBrand: unique symbol;
export type Cursor = { readonly [cursorBrand]: never };
```

Internal DAL code uses `SortValues` freely. At the DAL boundary, values are cast to `Cursor` before returning. No code outside `dal/` ever sees the underlying array.

**What disappears:**
- `extractSortValues(img, orderBy)` called from `ImageGrid`, `ImageDetail`, `ImageTable`, `useRangeSelection`
- `SortValues` imports in stores, hooks, components
- `fromCursor`, `toCursor` as inspectable arrays in `useRangeSelection`
- The image-offset cache storing raw sort arrays keyed by field path

**What replaces them:**
- `store.getCursor(imageId): Cursor | null` — the store derives the cursor internally
- `store.seek(cursor: Cursor)` — scrubber hands back the cursor it was given, doesn't construct one
- `store.selectRange(anchorId: string, targetId: string): Promise<void>` — hook expresses intent, DAL does the cursor walk

---

## SortOrder

`orderBy = "-uploadTime,credit"` is an ES sort syntax string. It is currently:
- a URL parameter
- a display configuration key
- parsed by hand in `SearchFilters`, `ImageGrid`, `ImageGrid`, `sort-context`
- the default `"-uploadTime"` hardcoded in at least four places

Replace with a typed value at the URL parsing boundary:

```ts
// lib/sort-order.ts
export type SortField = "uploadTime" | "dateTaken" | "lastModified" | "credit" | "dateAddedToCollection";
export type SortDirection = "asc" | "desc";
export type SortOrder = { primary: SortField; primaryDir: SortDirection; secondary?: SortField; secondaryDir?: SortDirection };
```

The URL schema parses `orderBy` into `SortOrder` once, at the router boundary. The DAL translates `SortOrder` back to ES syntax internally. No component parses a sort string.

**What disappears:**
- `parsePrimarySort(orderBy)` in `SearchFilters`
- `orderBy.split(",")[0].replace(/^-/, "")` in `ImageGrid`
- `(orderBy ?? "-uploadTime").split(",")[0]` in `sort-context`
- The three independent reimplementations of the same parser

---

## Null zone

The null zone is an ES artifact — images missing a value for the primary sort field are placed at the end of the index by `missing: "_last"`. This is not a domain concept; it is an implementation detail of how ES handles sparse fields.

The concept is currently named and passed around as `nullZoneDistribution` in route state.

**Rule:** if the null zone must be represented in the UI (for scrubber labels), it is exposed as a sealed variant on the tick label type, not as a raw distribution object.

```ts
// The scrubber asks for ticks. The store returns tick descriptors.
// The scrubber never knows why some ticks are labelled differently.
type Tick = { position: number; label: string; isBoundary?: boolean };
```

The store computes ticks internally — using whatever combination of primary distribution, null-zone distribution, and uploadTime fallback it needs. The scrubber renders what it receives.

`nullZoneDistribution` does not appear in route state. `coveredCount` does not appear in route state. `resolveKeywordSortInfo(orderBy)` and `resolveDateSortInfo(orderBy)` (which return ES field paths) do not appear in route files.

---

## Orchestration boundary

The following calls should not exist outside `dal/`:

| Current location | Current call | Replacement |
|---|---|---|
| `ImageDetail.tsx` | `dataSource.getById(imageId)` | `store.lookupImage(imageId)` |
| `CqlSearchInput.tsx` | reads `dataSource` from store | `store.getTypeaheadSuggestions(field, prefix)` |
| `useRangeSelection.ts` | `selStore.dataSource.getIdRange(from, to)` | `selStore.selectRange(anchorId, targetId)` |
| `search-store.ts` | imports `buildSortClause`, `parseSortField` from DAL | stays in DAL; store calls DAL methods, not DAL internals |

The store is not the DAL. The store holds application state and exposes intent-based methods. The DAL holds ES knowledge and fulfils those intents. Stores importing DAL-internal functions (`buildSortClause`, `parseSortField`, `detectNullZoneCursor`) is the same category of violation as components doing it — the boundary is `dal/index.ts`, not `dal/es-adapter.ts`.

---

## What the BFF owns

Everything currently in `dal/es-adapter.ts`, `dal/adapters/elasticsearch/`, `dal/null-zone.ts`, `dal/position-map.ts` moves to the BFF. No ES client code is bundled into the browser. The browser's DAL becomes a set of typed fetch calls to BFF routes.

**Filter logic** — `buildQuery`, `buildFreeFilter`, `buildSyndicationStatusFilter`, `parseCql`, `buildSortClause` all move to the BFF. The vendored `guardian-config.json` in the browser bundle goes away. The duplication with the Scala equivalents in media-api is a separate problem (see below), but at least it is server-to-server duplication, not server-to-browser.

**PIT lifecycle** — the BFF opens, refreshes, and closes PITs. The browser never sees a PIT ID. The BFF issues the browser an opaque continuation token (a signed string encoding the sort cursor and optionally a server-side PIT session key). The browser passes it back on the next request; the BFF decodes it and issues the `search_after` against ES.

**Position index** — a full-index walk returning millions of `[id, sortValues]` pairs cannot be a synchronous request-response, but it can be a server-sent event stream from the BFF. The browser receives chunks progressively, the same as it does now except the ES calls happen in Node rather than the browser. Alternatively, if streaming is not available in the deployment, position indexing falls back to estimation (percentile agg + binary search via composite aggs) — both of which are single round-trips and fast enough to be synchronous.

**Range selection** — `getIdRange` is a cursor walk that can take many round-trips to ES. As a BFF route it becomes a single HTTP request from the browser: `POST /search/id-range { from: Cursor, to: Cursor }` — the BFF does the walk internally and returns the ID list.

**Composite agg walks** — `findKeywordSortValue` and `getKeywordDistribution` become BFF routes. The multi-page composite agg loop runs in Node, the browser receives the result in one response.

---

## Relation to media-api

Media-api remains the authority for:
- HATEOAS image enrichment (cost, validity, leases, exports, actions)
- Write operations (delete, undelete, syndication, crops)
- Usage/quota data
- Completion suggestions

Whatever serves ES queries owns:
- All search and aggregation queries
- Cursor/PIT management
- CQL parsing and query building
- Sort distribution and scrubber data

The filter logic duplication (Scala `SearchFilters`/`SyndicationFilter` vs. TypeScript equivalents) is the main ongoing maintenance cost. The correct long-term resolution is to call `GET /images` on media-api for common searches — getting Scala's filter logic for free — and go direct to ES only for operations media-api cannot serve (cursor pagination, PIT, composite agg walks, position index). This preserves media-api as the single source of truth for filter rules and eliminates drift.

---

## Unresolved: who serves ES queries

There are two viable regimes:

**A — media-api adds streaming** (SSE or WebSocket). ES knowledge stays in Scala. Play/Pekko handles the stream. No separate server process. The browser speaks a streaming protocol defined by the Scala service.

**B — kupua BFF** (Node, tRPC or similar). ES knowledge moves to TypeScript. End-to-end type safety in one language. The query layer can be co-evolved with the UI without touching the shared Scala service. Filter logic duplication (currently Scala vs. TypeScript) is resolved by the BFF calling media-api for common searches and going direct to ES only for primitives media-api cannot serve.

This decision must be made. It cannot stay open. Both are technically viable. The purely technical case for B is that the whole stack is one language, tRPC gives compile-time guarantees across the boundary with no schema declaration overhead, and the query layer can evolve without coupling to the shared media-api release cycle.

---

## Writes go through Thrall. RYOW polling is maintained.

The Grid is event-sourced on the write path. All mutations flow:

```
kupua BFF  →  media-api  →  Kinesis  →  Thrall  →  ES
```

No component of kupua writes to ES directly, ever. The BFF's direct ES surface is strictly read-only. Media-api is the only entry point for mutations, and Thrall is the only writer to the index.

**RYOW — Read Your Own Writes.** Because the write path is asynchronous (Kinesis → Thrall → ES), a write that media-api accepts is not immediately visible in the ES read path. Kahuna handled this with polling: after issuing a write, it polled until its own write was reflected. Kupua maintains this pattern.

In practice: after a mutation (delete, label, usage rights change, etc.) the BFF — or the client via the query layer — polls the read path at a short interval until the updated state is visible, then stops. The polling is not indefinite; it has a timeout after which the UI shows a stale-state warning and lets the user refresh.

The query tech requirement fits this naturally. TanStack Query's `refetchInterval` and mutation-triggered invalidation handle the RYOW loop without manual polling logic in the store. The mutation fires, the relevant queries are invalidated, and background refetch runs until the new state lands.

**Optimistic updates** may be applied on the client for immediate feedback, but they are considered tentative until the RYOW poll confirms the write landed. If polling times out without confirmation, the optimistic update is rolled back.

---

## Access control

The kupua BFF must enforce the same access controls as media-api. It is not a trusted internal service and must not be treated as one. It is a user-facing server that happens to be written in JavaScript.

**Authentication.** Every BFF request must be validated against panda (the Guardian's SSO system) before any ES query or media-api call is issued. An unauthenticated request to the BFF must be rejected at the BFF boundary — not forwarded to ES or media-api and rejected there. The BFF owns the auth check; downstream services are not the fallback.

**The BFF is not a bypass route.** Direct ES queries issued by the BFF are not subject to media-api's per-request authorization logic. This means the BFF's direct ES surface must be limited to operations that are genuinely read-only and non-sensitive (search, count, aggregations), and only after panda auth is confirmed. Write operations and anything requiring per-user authorization must be proxied through media-api, which enforces those rules.

**Authorization.** For operations the BFF proxies to media-api, the user's panda identity must be forwarded so that media-api's authorization logic applies (the BFF does not re-implement it). For operations the BFF issues directly to ES, the authorization check is simply "is this user authenticated" — ES has no concept of per-user data visibility in this system.

**Implication for regime choice.** Regime A (media-api streaming) gets this for free — panda auth is already enforced by media-api. Regime B (kupua BFF) must implement panda validation in Node. This is a concrete piece of work, not a minor detail.

---

## Deployment

Kupua is the polished grid — deployed immediately alongside the existing grid, not after it is feature-complete. It lives at its own subdomain: **`siatka`** (Polish: grid).

**Riff-Raff.** Kupua follows the same deployment pattern as every other Grid service. Add `siatka` to `riff-raff.yaml` as an `autoscaling` deployment in the `media-service` stack alongside `kahuna`:

```yaml
siatka:
  template: autoscaling
```

When the BFF is introduced it gets its own entry. The frontend (static assets) and BFF (Node process) are separate deployments — they have independent release cycles and must be deployable independently.

**CI is set up from day one.** Not retrofitted. The CI pipeline must:
- Install, build, and typecheck kupua
- Run all unit tests (zero tolerance for skipped or failing tests in CI)
- Lint
- Package and upload artifacts to S3 for Riff-Raff
- Gate deployment on all checks passing

CI runs on every pull request and on merge to main. Deployment to TEST is automatic on merge. Deployment to PROD is manual via Riff-Raff, same as all other Grid services.

**Domain structure.**
- Local: `siatka.local.dev-gutools.co.uk`
- TEST: `siatka.test.dev-gutools.co.uk`
- PROD: `siatka.gutools.co.uk`

The existing `allowedHosts` Vite config already accepts `.local.dev-gutools.co.uk` — the local domain requires no change.

---

## Observability

Kupua will launch as a limited beta. The advanced ES patterns — cursor pagination, PIT lifecycle, composite aggregation walks, position indexing — are not yet understood under real production load. Observability is not a monitoring afterthought; it is how the team learns whether these patterns are viable.

**Every ES operation on the BFF must emit an OTel trace span and metrics.** Not sampled. Not best-effort. Every one.

Each span must carry:
- Operation name (`search`, `search-after`, `count-before`, `position-index-chunk`, `composite-agg-page`, `pit-open`, `pit-close`, `keyword-distribution-page`, `ryow-poll`)
- Query shape: result set size, sort field, whether filters are active (not the raw query — don't log PII from free-text fields)
- ES-reported `took` (shard time) alongside wall-clock time — the gap between them reveals serialisation and network overhead
- Page number for multi-page operations (composite walks, position index chunks)
- Whether a PIT was active, and whether it had to be refreshed or fell back to non-PIT

**Metrics** (histograms unless noted):
- ES query latency by operation type
- Position index total duration and document count
- Composite agg walk page count per request
- RYOW polling round count and total wait time until write is visible
- PIT open count, close count, expiry count (counters)
- Media-api enrichment latency and chunk count

**The novel operations need named parent spans** so they are identifiable end-to-end in a trace:
- `position-index` — wraps all PIT open, chunk fetches, and PIT close for one full walk
- `keyword-distribution` — wraps all composite agg pages for one distribution fetch
- `range-selection` — wraps the full cursor walk for one `getIdRange` call
- `ryow-wait` — wraps all poll attempts from write acceptance to confirmed visibility

**Client-side.** The browser emits performance marks (Web Performance API) for:
- Time to first image rendered
- Time to enrichment overlay applied
- Scrubber ready (distribution data received)

These are forwarded to the BFF via a lightweight telemetry endpoint and attached to the parent trace for the originating search. This gives end-to-end latency from user action to perceived completion, not just server-side query time.

**Regime note.** For regime A (media-api Scala), OTel is via the Java agent. For regime B (Node BFF), OTel Node SDK with auto-instrumentation for `fetch` and manual spans for ES operations. Either way the span names and attribute schema above apply — the traces must be readable by someone who doesn't know which regime was chosen.

---

## Testing

**Every change ships with passing unit tests.** Not as a goal — as a gate. A change that touches untested code adds tests for that code as part of the same change, not as a follow-up.

**Hard to test means refactor, not skip.** If writing a test for something requires elaborate mocking, a complex test harness, or testing internal implementation details rather than observable behaviour, the code is too coupled. The test difficulty is a design signal. Fix the code.

The FP style rule and the testability rule are the same rule from different angles. A pure function that takes data and returns data has exactly one thing to test: given this input, does it return this output? No mocks, no setup, no teardown. When ES query building, filter logic, sort clause construction, and cursor encoding are pure functions — as they should be under the FP rule — they are trivially testable in isolation. When they are methods on a class that also does HTTP calls, they are not.

**The boundary for effects.** HTTP calls and PIT lifecycle operations are effects. They should be injectable at a single boundary — a fetcher function, a clock — so that the logic around them can be tested without them. Tests do not make real HTTP calls and do not require a running ES cluster.

OTel is not an effect in this sense. It is infrastructure that runs everywhere and benefits all code. It is not mocked out in tests, not injected at a boundary, and not treated as something to be isolated. The OTel SDK's no-op exporter means instrumented code tests cleanly without a collector. Instrumentation should be added freely — the goal is maximum coverage, not minimum surface.

**What counts as a unit.** A function with clear inputs and outputs. Not a class method that reads from `this`. Not a store action that calls three other store actions. If the unit of code under test requires instantiating a large object graph to exercise a small behaviour, the behaviour should be extracted into a function that can be called directly.

**Coverage of the novel operations.** The ES patterns that are not well understood — cursor pagination, composite agg walks, position indexing, PIT expiry fallback — must have unit tests for their logic before they ship. This is non-negotiable precisely because the team does not yet have production experience with them. Tests are the first line of evidence that the logic is correct.

---

## Style rules

**File size.** 700 lines maximum. A file approaching that limit is a signal that it contains more than one concept and should be split. `search-store.ts` and `es-adapter.ts` both currently exceed this.

**Functional paradigms.** Prefer pure functions and data transformations over stateful procedures. `map`, `filter`, `reduce` over loops with accumulation. Functions that take data and return data, with effects pushed to the edges.

**No mutation.** Objects and arrays are not modified after creation. No `arr.push()`, `arr.splice()`, `obj.field = value`, `delete obj.field`. Return a new value; don't change an existing one.

**No fake immutability.** `Object.freeze()` is not immutability — it is a runtime assertion with no type-level enforcement and shallow coverage. `readonly` on a type that wraps a mutable structure is not immutability — it is a lie the compiler believes. Immer's `produce()` is mutation with a Proxy in front of it. None of these count. Immutability means the data structure cannot be mutated by any code path, not that the current call site happens not to mutate it.

---

## Non-negotiable requirements (independent of the regime)

These apply regardless of whether regime A or B is chosen.

**Query tech on the client.** The browser uses a proper query library — TanStack Query or equivalent — as the data-fetching layer. It handles caching, deduplication, background refetch, pagination, and loading state. The current manual orchestration in `search-store` (abort controllers, cursor threading, cache keys, ticker polling) is replaced by query hooks. `useInfiniteQuery` with an opaque `nextCursor` handles cursor pagination without the browser understanding what a cursor is.

**The browser has no ES knowledge.** Not as a goal — as a constraint. The browser does not know that Elasticsearch exists. It calls typed procedures or query hooks (`useImageSearch`, `useDistribution`, `useIdRange`) that return domain objects. No ES query DSL, no sort arrays, no PIT IDs, no field paths, no filter builders, no CQL parser are included in the browser bundle. The boundary is enforced by the fact that all ES code lives on the server, not by convention or discipline.

---

## Domain objects at the DAL boundary

The DAL returns domain objects. It never returns ES response shapes.

### The response envelope

An ES response has a fixed structure regardless of what was queried:

```json
{ "took": 4, "_shards": {...}, "hits": { "total": { "value": 1200 }, "hits": [...] } }
```

None of `took`, `_shards`, `hits.total.relation`, `hits.hits[*]._id`, `hits.hits[*]._score`, or `hits.hits[*].sort` are domain concepts. They are ES wire format. They must not appear in the types returned by any DAL method.

Currently violated by:
- `SearchResult.took` — ES internal timing, passed through and used in `devLog` calls outside the DAL
- `SearchAfterResult.pitId` — raw ES PIT identifier, stored in search-store state and passed back to the adapter
- `SearchAfterResult.took` — same as above
- `SortDistBucket.key` — an ES aggregation bucket key (ISO date string or keyword), passed through as a raw string to the scrubber tick computation

### PIT handle

`pitId: string` is an ES Point-in-Time identifier. The store holds it in state and passes it back into `dataSource.searchAfter()`. This makes the store a participant in PIT lifecycle management — a DAL responsibility.

The DAL should own PIT lifecycle entirely. The store calls `dataSource.search()` and `dataSource.extend(cursor)`, not `dataSource.openPit()` / `dataSource.searchAfter(cursor, pitId)`. The DAL decides internally whether to use a PIT, when to open one, when to refresh it, and when to close it.

```ts
// Store sees this:
interface SearchResult { images: Image[]; total: number; endCursor: Cursor; }

// DAL manages internally:
// - PIT open/close
// - pit_id refresh on each response
// - fallback to non-PIT on 404/410
```

`pitId` disappears from store state. `SearchAfterResult` disappears entirely — `searchAfter` is a DAL-internal method, not a public interface.

### Timing

`took` is an ES-internal shard execution time in milliseconds. It does not include network, serialisation, or proxy overhead. Passing it to callers implies it is a meaningful latency metric, which it is not.

If performance tracing is needed, the DAL measures wall-clock time itself and returns a domain-named field — `queryMs` or nothing at all. `took` does not cross the boundary.

### Aggregation results

`AggregationResult.buckets[].key` is an ES bucket key — a raw field value from the index. For date fields it is an ISO string, for keyword fields it is the stored term. This is acceptable because the bucket key _is_ the domain value (a date, a credit string). The type is correct but it must be strongly typed, not `string`.

```ts
// Not this:
type AggregationBucket = { key: string; count: number };

// This — key type is determined by the field being aggregated:
type DateBucket    = { date: Date;   count: number };
type KeywordBucket = { value: string; count: number };
```

### `_source` as `Image`

Passing `hit._source as Image` is the correct pattern — it maps the ES document to the domain type. The cast is valid as long as `Image` is defined against the actual index mapping, not derived from the ES response shape. `Image` is a domain type that happens to be stored in ES; it is not an ES type.

The violation would be returning `hit._source` as `unknown`, `any`, or `Record<string, unknown>` and letting callers cast it themselves. That is passing raw ES document data through the boundary.

### Server side

On the media-api side, the same rule applies. `ElasticSearch.scala` already maps `GetResponse` → `Image` before returning. The one deliberate exception is `GET /images/:id/_elasticsearch`, which returns raw ES source for debugging. It is an exception, documented as such, and should not be a pattern.

---

## What "specifically revealed" means

Some ES concepts are genuinely load-bearing in the UI and cannot be fully hidden. The rule is not that they must be invisible — it is that each crossing must be **intentional and named**.

Example: the scrubber needs to give the store a seek target derived from a pixel position. The store needs to give the scrubber something it can hand back later. A `Cursor` is the right type for this — opaque, passable, but not inspectable. That is a deliberate API surface.

Example: the search input needs to know what fields are sortable. A `SortField` enum crossing the boundary is intentional and typed. An `orderBy` string crossing the boundary and being parsed on the other side is accidental leakage.

The test: if removing an ES detail from a component requires touching the DAL, it was load-bearing and should be a named type. If removing it only requires moving a string parse into the store, it was leaked and should not have crossed.
