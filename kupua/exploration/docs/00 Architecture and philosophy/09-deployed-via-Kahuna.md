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

### Frontend bundle versus server settings

- `npm --prefix kupua run build:hosted` builds with `VITE_HOSTED=true` and
  `VITE_USE_MEDIA_API=true` into `kahuna/public/kupua`, with settings only from
  `hosted/.env.hosted` ([vite.config.ts](../../../vite.config.ts)).
- Kahuna serves that page to users who opted in: `/kupua/on` sets the cookie, `/kupua/off`
  clears it and returns to Kahuna ([KahunaController.scala](../../../../kahuna/app/controllers/KahunaController.scala)).
  The page carries its own Content Security Policy.

Local Kahuna serves the last hosted bundle built from the local checkout, including
any uncommitted source at build time. It does not use Vite or the normal `kupua/dist`
output. The built page is reread per request, so a hosted rebuild followed by browser
reload does not require restarting local Grid. Grid's no-flags/`--use-TEST` choice
selects backing services, not a different frontend bundle. Remote hosting serves the
bundle packaged in the deployed artifact; pushing source alone does not update it.

The hosted build's env file supplies build-time settings, **not the server's write
enablement**. Kahuna supplies write settings at runtime. `/kupua/on`, building the
bundle and choosing a TEST data source do not themselves enable editing.

### Which script owns each flag?

Commands below are written from the repository root. The two `start.sh` scripts are
different programs; their identically named `--use-TEST` flags are not interchangeable.

| Command | What it starts or selects | Effect on Kupua |
|---|---|---|
| `./dev/script/start.sh` | Grid's local services and local dependencies | Kahuna can serve the existing hosted bundle after `/kupua/on`; no Kupua Vite server is needed. |
| `./dev/script/start.sh --use-TEST` | Local Grid services configured against TEST backing services; downloads media-api and Kahuna TEST configuration | Kahuna still serves the locally built Kupua bundle, but its API/data and effective server settings come from this Grid setup. |
| `./kupua/scripts/start.sh --use-media-api --canonical-media` | Kupua's Vite server, reading the already-running local Grid API and its returned media URLs | Does not select or change Grid's backing data and skips Kupua ES/tunnel/media-proxy setup. |
| `./kupua/scripts/start.sh --use-media-api` | Kupua's Vite server and legacy TEST discovery/setup for its media proxies | Reads the already-running local Grid API; the TEST setup does not reconfigure that Grid API. |
| `./kupua/scripts/start.sh --use-media-api --canonical-media --use-TEST` | Kupua's Vite server with explicit TEST infrastructure setup retained | Still reads the already-running local Grid API; Grid independently chooses its backing data. |
| `./kupua/scripts/start.sh --use-deployed-media-api --canonical-media` | Kupua's Vite server reading deployed TEST media-api directly, with returned media URLs | Does not use local Grid for image-data reads; omitting `--canonical-media` selects the existing local media proxies instead. |
| `./kupua/scripts/start.sh --use-TEST` | Kupua's direct-Elasticsearch TEST mode | Not an API-mode editing topology; direct-ES editing is unavailable. |

Source: [Grid launcher](../../../../dev/script/start.sh) and
[Kupua launcher](../../../scripts/start.sh). Starting Grid against shared backing
services requires separate authorization; these examples do not grant it.

### Editing support by frontend

This table describes implemented code support, **not enablement or live verification**.
All supported editing remains one image and one label per submission, requires explicit
rollout and valid service origins, and remains subject to image capabilities and server
authorization. Thumbnail/full-image delivery does not change operation support.

| Frontend path | Add label | Remove label | Enablement source |
|---|---|---|---|
| Vite with `./kupua/scripts/start.sh --use-media-api`, with or without `--canonical-media`; local Grid may use local or TEST backing data | Code-supported | Code-supported | Vite process environment |
| Vite with `./kupua/scripts/start.sh --use-deployed-media-api`, with or without `--canonical-media` | Code-supported | Code-supported | Vite process environment; real cross-origin deployment remains unverified |
| Kahuna-hosted `/kupua/on`, local Grid or deployed DEV/TEST | Code-supported | Code-supported | Kahuna server configuration |
| Direct-ES, including `./kupua/scripts/start.sh --use-TEST` alone | Unavailable | Unavailable | No editing enablement in this mode |

Kahuna's current opt-in is limited to DEV/TEST and excludes iframe pickers; this table
does not extend those stage boundaries. The real operator add/remove trial used Vite
with local Grid. Compiled-hosted fixtures and the actual Kahuna configuration producer
have regression coverage; real Kahuna-hosted and shared TEST editing remain separate
verification/authorization boundaries, not claims established by the local trial.

### Where the write configuration lives

Kahuna's two rollout keys are `kupua.mutations.enabled` and
`kupua.mutations.operations`. They are separate from the addresses of metadata-editor
and auth, which come from Grid's existing service configuration.

| Running frontend | Configuration source |
|---|---|
| Kupua Vite, started by `./kupua/scripts/start.sh` | Its process environment: `VITE_GRID_API_WRITES_ENABLED`, `VITE_GRID_API_OPERATIONS`, `VITE_GRID_METADATA_ORIGIN`, `VITE_GRID_AUTH_ORIGIN`. Use an explicit temporary invocation for trials, not persistent `.env` enablement. |
| Kahuna-hosted Kupua, Grid started by `./dev/script/start.sh` without `--use-TEST` | `~/.grid/common.conf`, then `~/.grid/kahuna.conf`; later values override earlier ones. Kahuna's own file is the appropriate local place for its rollout settings. |
| Kahuna-hosted Kupua, Grid started by `./dev/script/start.sh --use-TEST` | The same local files, then `/tmp/grid-config-TEST/kahuna.conf`, downloaded at startup from `s3://grid-conf/TEST/kahuna/kahuna.conf`. The downloaded file overrides matching local keys, not the entire local configuration. It is overwritten by subsequent TEST startup, so it is not a durable configuration source. |
| Kahuna-hosted Kupua, deployed Grid | Installed server files in increasing precedence: `/etc/gu/grid-prod.properties`, `/etc/grid/common.conf`, `/etc/gu/kahuna.properties`, `/etc/grid/kahuna.conf`. Missing files are skipped; the properties files are legacy. These are runtime read locations, not a claim about every deployment's provisioning mechanism. |

The source of truth for file loading and precedence is
[GridConfigLoader.scala](../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/GridConfigLoader.scala).
In local DEV mode, JVM/config-library overrides take precedence over those files;
Grid's TEST launcher uses `extraConfigDir` to add the downloaded file. Hosted Kupua
does not consume the Vite rollout environment variables.

**Missing effective rollout configuration means editing is off.** A missing enabled
key defaults to false; a missing operations key defaults to an empty list. Both
global enablement and the selected implemented operation are required. Malformed or
unknown operation configuration fails closed; image capabilities and server
authorization still apply.

**Do not confuse a missing TEST key with effective absence.** If local Kahuna config
enables editing and the downloaded TEST file omits those keys, the local settings
remain effective when Grid is started with `--use-TEST`. Keep local enablement off
outside an authorized local trial; do not rely on omission in TEST S3 to disable a
local override. Check the effective configuration before any shared-system trial.

For local preparation, add this non-secret, disabled block to `~/.grid/kahuna.conf`
without replacing its other settings:

```hocon
kupua.mutations {
  enabled = false
  operations = ["add-labels", "remove-label"]
}
```

Kahuna recognises both implemented names, individually or together; any unknown
name fails the whole rollout closed. The disabled block prepares local configuration
without enabling writes. Merely adding it does not authorize turning it on or changing
TEST S3. Keep it disabled until an explicitly authorized trial, and account for the
local-to-TEST fallback described above before switching Grid's backing services.

Server configuration is loaded when Grid constructs its application configuration;
changing a file requires a server configuration reload/restart, followed by a browser
reload. Changing Vite environment settings requires restarting Vite. Neither change
is accomplished by rebuilding the hosted frontend bundle. Conversely, changing only
the hosted frontend bundle needs a browser reload, not a Grid restart.

### Runtime payload

Kahuna injects `window.__KUPUA_CONFIG__` before any module runs
([KupuaPage.scala](../../../../kahuna/app/lib/KupuaPage.scala)):

| Key | Used for |
|---|---|
| `mediaApiUri` | Base for every media-api call; satellite services are discovered from its root links |
| `collectionsUri` | Collections tree |
| `metadataEditorUri`, `authUri` | Trusted origins for command resources and session reads |
| `mutations` | Default-off `{ enabled, operations }` rollout; client and Kahuna admit only the implemented names `add-labels` and `remove-label` |
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
are not. Explicit rollout connects the existing editor for one image and one label
per submission; otherwise it remains disconnected. No shared-system enablement is
approved. The selected local trial and current deployment limits belong to
[Step 5](../gradually-growing-teeth.kupua-edits-steps.md#step-5-give-one-label-operation-real-teeth).

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
