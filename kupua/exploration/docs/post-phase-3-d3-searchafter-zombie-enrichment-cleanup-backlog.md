# Zombie-enrichment cleanup backlog

**Created:** 2026-06-12. **Status:** backlog — do NOT action mid-D3 unless trivial.

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
