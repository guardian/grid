# Zombie-enrichment cleanup backlog

**Created:** 2026-06-12. **Status:** ~~backlog~~ **Partially actioned 2026-06-15** — see [Action taken](#action-taken--2026-06-15) at the bottom for what was deleted, what was kept, and why.

## Context (one paragraph)

The old background enrichment loop (`useEnrichment`, `?ids=` mirror/batch) was
**deleted 10 May 2026** (changelog Session A; `enrichment-strategy.md` §F). It was
replaced by direct-ES + widened `SOURCE_INCLUDES` + TS-replication
(`calculate-cost`, `validity-map`, `quota-store`, `graphic-image-blur`). The
**merge seam it fed survived** — `deriveImage` / `useEnrichedImage` /
`enrichment-store` / `EnrichmentFields` — but **nothing populates the overlay
anymore** (`setEnrichment` is called only in tests), so `deriveImage` always
returns pure ES baseline.

`isPotentiallyGraphic` was never revived via the enrichment overlay — the Painless
script that emitted it was removed (see `post-phase-3-d3-searchafter-blur-graphic-work.md`).
Blur is now computed entirely client-side in `isImagePotentiallyGraphic()` and is
no longer part of `EnrichmentFields` or `EnrichedImage`.

## Architecture homes (keep these single)

- **Route switch:** `dal/strangler-adapter.ts` — the one place that decides
  ES-direct vs media-api per method. All route logic lives here.
- **Merge point:** `lib/derive-enriched-image.ts` (`deriveImage`) — the ONLY
  place that knows both data sources exist. Stays route-agnostic
  (`image` baseline ⊕ optional `overlay`).

## KEEP (revived / repurposed by D3 — not cleanup)

- `stores/enrichment-store.ts` — now populated from search-after hits (media-api mode).
- `lib/derive-enriched-image.ts`, `hooks/useEnrichedImage.ts` — unchanged merge seam.
- `dal/grid-api/types.ts` — widely-imported types (`Cost`, `SyndicationStatus`, …).
- `lib/cost/*`, `lib/graphic-image-blur.ts` — TS-replication = the standalone
  (no-Grid) floor. Permanent until/unless direct-ES is retired (far off).

## DELETE LATER (confirmed dead — verify no new use, then remove)

- `dal/grid-api/grid-api-adapter.ts` `enrichByIds()` — fed the deleted `?ids=` loop.
  No app call site (grep: tests only).
- `lib/grid-api-instance.ts` + the `initGridApi()` boot call in `routes/search.tsx`
  — discovers a service the app never calls. Verify search-after doesn't need
  HATEOAS discovery (it uses the `/api` proxy path directly), then drop.
- `dal/grid-api/service-discovery.ts` — only used by the above. Drop with them.

## DORMANT-BUT-FUTURE (keep, document — do NOT delete)

- `dal/grid-api/grid-api-adapter.ts` `getImageDetail(id)` — intent-driven
  single-image enrichment (image-detail panel, `?include=fileMetadata`). Not
  wired yet, but a real near-future need. Leave in place; note it's unwired.

## CONSOLIDATE (tech-debt, do when touching either)

- `dal/grid-api-search-adapter.ts` `mapApiImageToImage()` **duplicates** the Argo
  unwrapping (`usages`/`leases`/`collections`) already in `dal/grid-api/argo.ts`
  (`unwrapSearchHits`/`unwrapEntity`). Unify on `argo.ts` so there's one
  Argo-unwrapping implementation. (Also reconcile `argo.ts`'s `SearchHitImageData`
  / `SearchResponseRaw` types with the search-after response shape.)

## Guardrail before deleting anything

The search-after-via-media-api path must be the **confirmed, tested** mechanism
(unit + e2e green, both routes) before removing the DELETE-LATER items — they're
the last traces of the previous architecture and double as reference.

---

## Action taken — 2026-06-15

D3 (`POST /images/search-after`) is confirmed working. The guardrail above is satisfied
for `enrichByIds` specifically: the new enrichment path (`apiSearchAfter` →
`extractEnrichment` → `enrichment-store` via `upsertEnrichment`) is covered by
`grid-api-search-adapter.test.ts`, including a dedicated F-1 regression guard.

### Decision table

| Item | This backlog said | Decision | Rationale |
|---|---|---|---|
| `enrichByIds()` method in `grid-api-adapter.ts` | DELETE | **Deleted** | Zero app call sites (tests only). Feeds the deleted `?ids=` mirror loop. Replacement path (`apiSearchAfter` enrichment) is covered by `grid-api-search-adapter.test.ts`. |
| `MAX_IDS_PER_REQUEST` constant + `VITE_ENRICHMENT_MAX_IDS_PER_REQUEST` env var | (implied delete with method) | **Deleted** | Only used by `enrichByIds`. Gone with the method. |
| `enrichByIds` tests in `grid-api-adapter.test.ts` | (implied delete) | **Deleted** | Tests for a deleted method. `SEARCH_HIT_DATA` / `SEARCH_RESPONSE_RAW` fixtures retained — a `getImageDetail` fixture-shape test uses them. |
| `lib/grid-api-instance.ts` | DELETE | **Kept** | This backlog's reasoning ("discovers a service the app never calls") was written before D3 shipped. Now that `GridApiDataSource` is in active use and `getImageDetail` is imminent, destroying and recreating this singleton is pure churn. The single background `GET /api` on mount is cheap and primes discovery before `getImageDetail` is first called. |
| `initGridApi()` call in `routes/search.tsx` | DELETE | **Kept** | Same reasoning as above. Verified: `apiSearchAfter` uses `/api/images/search-after` directly — does NOT need HATEOAS discovery. But `getImageDetail` (DORMANT-BUT-FUTURE) does, via `ServiceDiscovery.imageUrl()`. |
| `dal/grid-api/service-discovery.ts` | DELETE | **Kept** | Constructor dependency of `GridApiDataSource`. The gap-closure roadmap (`phase-3-minimal-gap-derivation-findings.md`) adds more methods to `GridApiDataSource`, and satellite service proxies (leases, usages, collections) will need URL helpers here. Deleting now would require changing the constructor, then recreating nearly the same class. Not dead code — dormant but near-future. |
| `mapApiImageToImage` / `argo.ts` duplication | CONSOLIDATE | **Deferred** | Tech-debt, not dead code. Tackle when touching both files. |

### Test coverage assessment

- **The deleted path has zero coverage risk.** `enrichByIds` had no app call sites;
  TypeScript would prevent any accidental reintroduction.
- **The replacement enrichment path is tested.** `grid-api-search-adapter.test.ts`
  covers `extractEnrichment` field-by-field, the `apiSearchAfter` contract with
  `deriveImage`, and the F-1 regression guard (probe calls must not write the store).
- **Pre-existing gap (not introduced here):** `StranglerAdapter` has no dedicated unit
  test verifying that `searchAfter` routes to `apiSearchAfter` rather than the ES path.
  Worth adding as a low-cost regression guard when next touching `strangler-adapter.ts`.
