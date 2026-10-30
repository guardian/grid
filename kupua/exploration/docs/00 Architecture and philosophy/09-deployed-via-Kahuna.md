# Deployed via Kahuna

How Kupua runs when Kahuna serves it, and where every piece of server-owned data comes from.
This describes the current state only. Laptop modes (direct-ES, local `--use-media-api`) are
summarised at the end.

## Serving and configuration

- `npm --prefix kupua run build:hosted` builds with `VITE_HOSTED=true` and
  `VITE_USE_MEDIA_API=true` into `kahuna/public/kupua`.
- Kahuna serves that page to users who opted in (cookie). `/kupua/off` clears the cookie and
  returns to Kahuna ([hosted-config.ts](../../../src/lib/hosted-config.ts)).
- Kahuna injects `window.__KUPUA_CONFIG__` before any module runs
  ([KupuaPage.scala](../../../../kahuna/app/lib/KupuaPage.scala)):

| Key | Used for |
|---|---|
| `mediaApiUri` | Base for every media-api call; satellite services are discovered from its root links |
| `collectionsUri` | Collections tree |
| `showPaid` | Initial and Home search defaults (`nonFree`) |
| `gridConfig` | Kahuna's client settings: staff organisation, field aliases, image types, download-as-usage, reaper, agency picks (ingredients, colour), ticker definitions, deny-syndication warning, graphic-image blurring |

Each value is validated ([hosted-config.ts](../../../src/lib/hosted-config.ts)); a missing or
invalid setting falls back to [grid-config.ts](../../../src/lib/grid-config.ts) defaults. All
requests send the user's session cookie (`credentials: "include"`).

## Server data sources

| Data | Server source | Kupua owner |
|---|---|---|
| Search results, positions, scrolling | media-api `POST /images/search-after`, `POST /images/window` | [grid-api-search-adapter.ts](../../../src/dal/grid-api-search-adapter.ts) |
| Totals and ticker counts | media-api `POST /images/count` | [api-data-source.ts](../../../src/dal/api-data-source.ts) |
| Facets, `is:` counts (deleted, under-quota, owned photo/illustration), usage counts | media-api `POST /images/aggregations` | [api-data-source.ts](../../../src/dal/api-data-source.ts), [search-store.ts](../../../src/stores/search-store.ts) |
| AI search | media-api `GET /images` with `aiQuery` | [grid-api-search-adapter.ts](../../../src/dal/grid-api-search-adapter.ts) |
| Single image (detail) | media-api `GET /images/:id` | [grid-api-search-adapter.ts](../../../src/dal/grid-api-search-adapter.ts) |
| Selected images | media-api `POST /images/mget` | [grid-api-search-adapter.ts](../../../src/dal/grid-api-search-adapter.ts) |
| Cost, validity, invalid reasons, rights, actions, syndication status, usages, leases, persistence | Fields of each media-api image entity, kept with the response that supplied them (see below) | [derive-enriched-image.ts](../../../src/lib/derive-enriched-image.ts) |
| Supplier quotas | media-api `GET /usage/quotas` | [quota-store.ts](../../../src/lib/cost/quota-store.ts) |
| Usage Rights categories (names, search aliases, replaced values) | metadata-editor `usage-rights-list`, found via media-api's `edits` root link | [usage-rights-catalogue.ts](../../../src/lib/usage-rights-catalogue.ts) |
| Collections tree | collections service `GET /collections` | [collection-store.ts](../../../src/stores/collection-store.ts) |
| Collection counts | media-api aggregations on `collections.pathId` | [collection-store.ts](../../../src/stores/collection-store.ts) |
| Thumbnails | `thumbnail.secureUrl` in each image | [image-urls.ts](../../../src/lib/image-urls.ts) |
| Full images | imgops `optimisedPng`/`optimised` link in each image | [image-urls.ts](../../../src/lib/image-urls.ts) |

**Server fields per image.** Search pages and AI results publish their entities' fields to the
shared enrichment store, replaced by each new search. Detail keeps its own for the open image.
Selection reads attach them to each returned image object, so they live as long as the selected
image's cached metadata. Consumers prefer, in order: the detail's own, the current search's, the
selection read's, then local rules.

**Categories.** Labels use server names. The `category:` typeahead lists Grid's configured
categories with counts that include the stored values each one replaces. The Filters Category
rows fold replaced values into their category; values no category claims keep their own row.
Searches send the category's search alias, which media-api expands.

**Counts follow the server.** Every count shown is either returned by media-api for the current
search or summed from its aggregation buckets using server-supplied category data. `is:` counts
are the server's own filter counts, so they always match what the `is:` search returns.

## Still local in deployed mode

| What | Why |
|---|---|
| Image border colours per category | Display only; no server source |
| Local cost and validity rules ([lib/cost/](../../../src/lib/cost/)), category label table, `grid-config.ts` defaults | Used only when a server value is missing |

## Laptop modes

Direct-ES mode computes everything above locally from Elasticsearch documents: cost, validity,
`is:` filters, free-to-use, category expansion and sort aliases mirror Grid's Scala code and can
lag it. Local `--use-media-api` mode uses the same server sources as deployed mode through Vite
proxies, with `grid-config.ts` defaults in place of Kahuna's settings.
