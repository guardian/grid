# Inventory handoff C — Grid backend pass

**Status:** transient. Delete after work lands.
**Mode:** research. Sonnet High.
**Session goal:** find EVERYTHING the Grid backend offers that isn't already in inventory A or B. Primary sources: media-api routes, ES queries, painless scripts, satellite services.

## Why

Inventory A mines our own docs (potentially incomplete or out-of-date). Inventory B mines kahuna client code (catches what kahuna actually uses, but kahuna may not use everything the backend offers). This session catches the third case: backend capabilities that kahuna doesn't yet use, or that ES indexes but neither client surfaces fully.

## Inputs

1. **Inventories A and B**, at `kupua/exploration/docs/inventory-A-from-docs.md` and `inventory-B-from-kahuna.md`. **Read both first.** Your job is to add to them, not duplicate.
2. Grid backend source code:
   - `media-api/conf/routes` — full route table.
   - `media-api/app/controllers/` — every controller method.
   - `media-api/app/lib/elasticsearch/ElasticSearch.scala` — ES query construction.
   - `media-api/app/lib/elasticsearch/SearchFilters.scala` (if exists) — filter construction.
   - `media-api/app/lib/ImageResponse.scala` — every server-computed field on responses.
   - `thrall/app/lib/elasticsearch/ElasticSearchExecutions.scala` and any painless scripts under `thrall/` — what does ingestion compute and store?
   - `leases/conf/routes`, `usage/conf/routes`, `cropper/conf/routes`, `metadata-editor/conf/routes`, `collections/conf/routes` — every satellite route.
   - `image-loader/app/` — what gets computed at upload time and stored in ES.
   - `common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/` — ES mappings if visible.

## Output

ONE markdown file: `kupua/exploration/docs/inventory-C-from-backend.md`.

Same table format as A and B. ONLY rows that aren't in A or B, or that contradict / extend them with backend evidence.

For each row also note **WHO computes** the field/capability:
- `image-loader` (upload-time, into ES)
- `thrall` (painless script during ingest, into ES)
- `media-api ImageResponse` (response-build time, server-derived from ES doc)
- `satellite-service` (leases / usage / cropper / metadata-editor / collections)
- `ES-aggregation` (aggs, facets — computed by ES at query time)

Add a `Computed-by` column to the right of `Lives in`.

## Specifically look for

- **Server-computed fields on `ImageResponse`** that A and B might miss. §6.7 of the contract audit names some; verify by reading the actual Scala.
- **Painless scripts in thrall** — every field they compute or transform. These are the ones we definitely can't trivially do client-side because they happen at ingest.
- **Aggregation endpoints** — does media-api expose facet/aggregation queries? (Kahuna's filter chip counts might come from these.)
- **Satellite-service computed fields** — `usage` rolls up rights-holder / publication usage; `leases` aggregates active/expired; `collections` does paths; `metadata-editor` maintains denylists.
- **Auth-related endpoints** — `/whoami`, `/permissions`, role checks. These are fundamentally server-only.
- **Quota state** — where does it live, who computes it, how often does it change?
- **Image-counter lambda** — global counts; how/where surfaced?
- **Image-embedder lambda** — semantic-search embeddings, if present.
- **Audit log endpoints** — image history, edit log.
- **Undelete / restore / soft-delete state.**
- **ES sort fields** — every field that has a `keyword` or `date` mapping suitable for sort. Kupua may be missing useful sort modes.
- **ES-only fields not on `ImageResponse`** — fields indexed but not surfaced (we could query them directly via ES adapter).

## Done criteria

- Every controller method in media-api read.
- Every satellite-service route file read.
- Every painless script in thrall read.
- Each row has a `Computed-by` value.
- 30+ new rows. Less = under-coverage.
- Out-of-scope appendix capped at 20 items.
- No commits, no recommendations.

## Push-back clauses

- If a backend capability is documented but appears unused by kahuna AND not in any inventory: still add it. The user wants the full Grid-knows-about-this surface, even unused features.
- If you find that a server-computed field could be replicated trivially in TS using only ES-baseline data: still mark it `API-only` for `Lives in` (where it currently lives) but note the TS-feasibility as `Trivial` with a citation to the ES fields needed. The user will decide.
- If you find that what kupua thinks is server-computed is actually pulled from ES at response-build time (i.e. media-api does no real compute, just serialises ES fields): flag this loudly in the appendix.
