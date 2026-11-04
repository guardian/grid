# Deployed via Kahuna

How Kupua runs when Kahuna serves it, and where every piece of server-owned data comes from.
The implementation sections describe the current state. Laptop modes (direct-ES,
local `--use-media-api`) are summarised at the end.

## Data-mode policy

Hosted Kupua is the future application and always uses media-api, never the
direct-Elasticsearch datasource or direct ES requests. API failure, empty results
or missing/invalid hosted configuration must not select ES. Direct-ES remains
temporary laptop support intended for eventual removal under separate authorization;
it is not an alternative hosted architecture.

Failure must not crash the shell, but required API data is not optional enrichment
over an ES baseline. Distinguish failed requests from successful empty results and
show an appropriate unavailable/error state at the owning UI. Genuinely optional
enrichment may be omitted. Do not build alternate data paths or retry machinery
merely to conceal API failure. Existing display defaults and calculations on
already-returned fields are not datasource fallback.

## Serving and configuration

- `npm --prefix kupua run build:hosted` builds with `VITE_HOSTED=true` and
  `VITE_USE_MEDIA_API=true` into `kahuna/public/kupua`, with settings only from
  `hosted/.env.hosted` ([vite.config.ts](../../../vite.config.ts)).
- Kahuna serves that page to users who opted in: `/kupua/on` sets the cookie, `/kupua/off`
  clears it and returns to Kahuna ([KahunaController.scala](../../../../kahuna/app/controllers/KahunaController.scala)).
  The page carries its own Content Security Policy.
- Kahuna injects `window.__KUPUA_CONFIG__` before any module runs
  ([KupuaPage.scala](../../../../kahuna/app/lib/KupuaPage.scala)):

| Key | Used for |
|---|---|
| `mediaApiUri` | Base for every media-api call; satellite services are discovered from its root links |
| `collectionsUri` | Collections tree |
| `metadataEditorUri`, `authUri` | Trusted origins for command resources and session reads |
| `mutations` | Default-off `{ enabled, operations }` rollout; currently only `add-labels` is implemented |
| `showPaid` | Initial and Home search defaults (`nonFree`) |
| `gridConfig` | Kahuna's client settings: staff organisation, field aliases, image types, download-as-usage, reaper, agency picks (ingredients, colour), ticker definitions, deny-syndication warning, graphic-image blurring |

Each value is validated ([hosted-config.ts](../../../src/lib/hosted-config.ts)); missing or
invalid display settings use [grid-config.ts](../../../src/lib/grid-config.ts) defaults.
An absent or invalid media-api address prevents API dispatch, never selecting ES. Service
API fetches send the user's session cookie (`credentials: "include"`); thumbnail `<img>` requests
follow the browser's separate image/CORS/cookie rules.

Hosted builds pin hosted/API mode even if the invoking shell has laptop-mode flags.
Kahuna reads `kupua.mutations.enabled` and `kupua.mutations.operations`; absent or
invalid values admit no writes. These settings affect only the Kupua page, not
ordinary Kahuna. Existing pages receive server config changes only after reload.
The rollout gates are temporary; server authorization and named-resource validation
are not. No editor UI is connected and no live enablement is approved.

The shared [command boundary](../../../src/dal/grid-api/README.md#step-2-command-boundary)
owns admission, emergency stop and explicit outcomes. Session expiry/account changes
require a full reload after authentication; mutations are never automatically replayed.
Built-page fixtures use synthetic origins, cookies and browser-policy responses, not
the deployed ingress. Actual credentialed preflight, CSRF and login-return behavior
remain deployment verification boundaries. No global CSP/CORS/CSRF policy was relaxed.

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

**Field aliases.** Searches on configured aliases, including `matchViaExistence` ones (e.g. C2PA,
where absence means `false`), are compiled by media-api, which also returns their values.

**Media delivery.** With the default hosted `VITE_MEDIA_DELIVERY=canonical` setting,
Kupua uses the URLs in each image. Laptop API modes opt in with `--canonical-media`. For thumbnails,
[media-api](../../../../media-api/app/lib/ImageResponse.scala) supplies an HTTPS CloudFront path
when a thumbnail domain is configured, otherwise a presigned S3 URL. The CloudFront branch does
not append a signing query; `secureUrl` does not mean every thumbnail URL is presigned, nor does
an unsigned-looking path establish public access. Full-image imgops links embed signed source
URLs that expire after roughly 15-25 minutes; a page reload fetches fresh ones.

An existing build-environment limitation remains: unlike the pinned hosted/API mode
flags, an explicit shell `VITE_MEDIA_DELIVERY` can override the hosted env file.
Do not build hosted assets with a laptop proxy-delivery override. Step 2 does not
change image delivery or certify that conflicting configuration.

Thumbnails use ordinary `<img>` elements without `crossOrigin`. Justified zoom reuses these
images as DOM tiles; it requires no origin-clean pixel access, CORS change or media proxy.

## Still local in deployed mode

| What | Why |
|---|---|
| Image border colours per category | Display only; no server source |
| Local cost and validity rules ([lib/cost/](../../../src/lib/cost/)), category label table, `grid-config.ts` defaults | Used only when a server value is missing |

## Laptop modes

The explicitly selected laptop direct-ES mode computes image policy and query inputs
locally from Elasticsearch documents: cost, validity,
`is:` filters, free-to-use, category expansion and sort aliases mirror Grid's Scala code and can
lag it. It does not support `matchViaExistence` aliases. Local `--use-media-api` mode uses the same server sources as deployed mode through Vite
proxies, with `grid-config.ts` defaults in place of Kahuna's settings and local imgproxy for
full images unless `--canonical-media` is set.
