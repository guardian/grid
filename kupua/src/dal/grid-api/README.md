# `dal/grid-api/` — Grid API adapter

This directory contains the adapter for Grid's media-api HATEOAS surface.
It is **entirely separate** from the ES adapter (`dal/es-adapter.ts`).

## Decision matrix — which adapter handles what

| Operation | Adapter | Why |
|---|---|---|
| Search, `search_after`, PIT | ES | Already built; no media-api equivalent |
| Aggregations, distributions, position maps | ES | 9 hard capability gaps in media-api |
| **Image detail** | **Grid API** | Cost / validity / signed URLs / actions — server-computed |
| Usages, leases, crops, edits (Phase B+) | Grid API (HATEOAS) | Server-side permission gating |
| Writes: metadata, leases, crops, delete (Phase C+) | Grid API (HATEOAS actions) | Never replicate server logic |
| Auth, permissions | Inferred from API responses | Trust the server; don't replicate |

Full rules: `integration-workplan-bread-and-butter.md §"Architectural rule"`.

## Merge direction (permanent rule)

ES baseline → API overwrite, never the inverse. ES-sourced fields are the
standalone-mode floor (kupua works without Grid). API enrichment overwrites
server-computed fields (`cost`, `valid`, `persisted`, `actions`, etc.)
when the API is reachable. This is not scaffolding to rip out.

## URL construction rule

**Never construct media-api URLs by string concatenation.** Always follow
links from service discovery (`service-discovery.ts`) or HATEOAS responses.

`imageUrl(id)` returns `/api/images/{id}` — the `/api` Vite proxy prefix
maps to media-api's rootUri, and `/images/{id}` follows the `image` link
template from the HATEOAS root. For Phase B satellite services, each service
gets its own proxy prefix (e.g. `/grid-leases`) added to `GRID_API_PROXY_PREFIXES`
in `vite.config.ts` — the write guard covers all prefixes in that array.

## Enrichment

Bulk enrichment for search results uses **mirror-search** (`GET /images?q=…`)
per buffer-fill, not per-id calls. See `enrichment-strategy.md` for the
full decision. The `useEnrichment` hook (Cluster 1) implements the merge layer.

## Graceful absence

All API failures return `null` → the ES-sourced view stays in place.
No error toasts, no broken layouts. 401/419 throw (user action required).
See the kupua "graceful API absence" directive in `copilot-instructions.md`.
