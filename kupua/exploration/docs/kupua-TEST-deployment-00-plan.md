# Kupua: TEST Hosting — Plan and Architecture

**Status, 23 October 2026:** Kupua is served by Kahuna on TEST behind an opt-in switch, built
from draft [PR #5103](https://github.com/guardian/grid/pull/5103) (branch `mk-next-next-next`,
never merged). Open work is listed in section 10.

## 1. Scope

The read-only Kupua prototype runs inside the existing Kahuna service, for the operator and,
later, a few invited users on TEST. It is not a production launch, a merge of Kupua to main or
an editing commitment. Deploying an ordinary Grid build removes it.

The [API build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md)
owns endpoint contracts and the U7 -> M2b sequence; canonical media delivery below is U7. This
document grants no permission: changes outside `kupua/` need operator approval, and agents never
push, deploy or mutate remote Git state.

## 2. Page Selection and Switching

Kahuna's `/`, `/search` and `/images/:id` share one action,
[KahunaController.index](../../../kahuna/app/controllers/KahunaController.scala). Inside the
existing login redirect, it serves Kupua's page instead of Kahuna's when all of these hold
([KupuaPage.shouldServe](../../../kahuna/app/lib/KupuaPage.scala)):

- the stage is DEV or TEST;
- the `feature-switch-use-kupua` cookie is `true`;
- the request is not an iframe (`Sec-Fetch-Dest: iframe`): Composer, MAM and other tools embed
  Grid as a picker and always get Kahuna;
- Kupua's built `public/kupua/index.html` is present.

Otherwise Kahuna's ordinary page is served. Crop, takedown, upload, quotas and all other routes
are always Kahuna's. Kupua's router redirects legacy `/images/:id` into its own detail URL under
`/search`. Kupua's page is sent with `Cache-Control: no-store`; Kahuna re-reads the file per
opted-in request, so a rebuilt page appears without a restart.

Switching:

- [UseKupua](../../../kahuna/app/lib/FeatureSwitch.scala) (`use-kupua`, default off) appears in
  Kahuna's feature-switch panel on DEV/TEST only. Reload after toggling.
- `/kupua/on` (DEV/TEST only, otherwise 404) sets the cookie with `Path=/`, `Secure`,
  `SameSite=Lax`, 30 days; `/kupua/off` clears it. Both redirect to `/search`. Not HttpOnly,
  because the panel reads switch cookies in the browser.
- Kupua's Settings menu has "Back to Kahuna", a plain link to `/kupua/off`, so leaving works even
  if Kupua's JavaScript is broken.
- There is no "Try Kupua" link in Kahuna and no search/state translation across the switch.
- The cookie is a UI preference, not authorization; media-api checks every request.

## 3. Runtime Configuration

Kahuna inserts `<script>window.__KUPUA_CONFIG__={...};</script>` immediately after `<head>`,
before Kupua's module script, from its own server configuration. JSON is serialized with `<`
escaped and contains explicit public fields only.

| Field | Source | Kupua use |
| --- | --- | --- |
| `mediaApiUri` | `services.apiBaseUri` | all media-api reads; missing or invalid refuses reads (no fallback) |
| `collectionsUri` | `services.collectionsBaseUri` | collection tree; missing is quiet absence |
| `showPaid` | request principal's `ShowPaid` permission; omitted when unknown | hosted initial/Home default (`false` → free-only) |
| `gridConfig` | allowlisted site settings ([config workplan](kupua-TEST-deployment-01-config-via-server.md)) | organisation, aliases, image types, tickers, agency picks, reaper/download vocabulary, deny-syndication banner, graphic-blur default |

[hosted-config](../../src/lib/hosted-config.ts) reads the object only in hosted builds and
accepts only https URLs without query or fragment. Local modes never read it, and the laptop
API-address allowlist in [proxy-target](../../src/dal/grid-api/proxy-target.ts) is unchanged.
One build therefore works on local Grid and on TEST, each talking to its own services.
Kahuna builds the extra fields only when serving Kupua. Kupua validates each `gridConfig`
setting whole and resolves it once when [grid-config](../../src/lib/grid-config.ts) first
evaluates; missing or invalid settings, and every laptop mode, keep its local defaults.

## 4. Media Delivery

| Mode | Data | Media |
| --- | --- | --- |
| Sample data, `--use-TEST` | Local/TEST ES | Sample absence, or local S3 proxy and imgproxy |
| `--use-media-api`, `--use-deployed-media-api` | Local/TEST media-api | Local proxies by default; `--canonical-media` uses returned URLs |
| Hosted (local Grid or TEST) | Serving stage's media-api | Always returned URLs |

[image-urls](../../src/lib/image-urls.ts) owns the choice, via `VITE_MEDIA_DELIVERY`
(`canonical` or `proxy`). [start.sh](../../scripts/start.sh) sets it, and rejects
`--canonical-media` in direct-ES modes, whose records carry no returned URLs.

- **Thumbnails:** `thumbnail.secureUrl`. TEST serves unsigned CloudFront URLs. No returned URL
  means no thumbnail, never a proxy fallback. No per-thumbnail metadata fetches.
- **Full images:** the [API mapper](../../src/dal/grid-api-search-adapter.ts) keeps each
  entity's `optimised`/`optimisedPng` hrefs as Kupua-internal `Image.__mediaLinks` (page,
  singleton, mget, AI). `getFullImageUrl` prefers the PNG link, as Kahuna does, and fills imgops'
  `{&w,h,q}` with a ~10-line expander (no URI-template dependency: imgops is to be replaced by
  imgproxy). It uses quality 85, adds no rotation (the link carries `r=`) and caps both sides at
  the longer native side. Detail, carousel prefetch and zoom share it. A missing link or
  unsupported template is absence; detail falls back to its thumbnail.
- **Expiry:** imgops links embed signed source URLs that expire after roughly 15-25 minutes;
  reload recovers. There is no automatic renewal.
- **Resource identity:** fresh metadata responses can re-sign that source within the
  same expiry bucket; resident traversal retains its buffered links. Current local
  imgproxy keeps S3 credentials out of its stable browser path. The
  [canonical evidence and PR #5075 recommendations](01%20Research/imgproxy-research.md#24-october-2026-canonical-delivery-and-pr-5075)
  distinguish this from the proposed nested-signing/resolver design. Paired
  configured-delivery results are retained there; they do not isolate transformer
  CPU, equal-codec performance or cold upstream delivery.

## 5. Hosted Build

`npm --prefix kupua run build:hosted` runs `tsc -b && vite build --mode hosted`. In that mode
[vite.config](../../vite.config.ts):

- sets base `/assets/kupua/` and writes to Kahuna's gitignored `kahuna/public/kupua/`;
- reads env only from [hosted/.env.hosted](../../hosted/.env.hosted) (hosted flag, API mode,
  canonical media, TEST-scale thresholds) and never loads `.env`/`.env.local`, so laptop
  settings cannot enter the package.

Notes on the output:

- Vite rebases asset paths in HTML and CSS only. Literal asset paths in code must use
  `import.meta.env.BASE_URL`, as the logo does.
- The justified-layout WebAssembly is inlined (base64). Vite's "doesn't exist at build time"
  warning concerns an unused fallback.
- Unreachable laptop strings (`localhost:9010`, the TEST API constant) remain in the bundle;
  hosted code paths never use them.
- `/s3`, `/imgproxy`, Elasticsearch and Bedrock paths are absent.

Kahuna serves the files through its existing `/assets/*file` route. Play's digest/gzip stages
add copies and keep Vite's hashed names servable.

## 6. Content Security Policy

Kahuna's policy, built in `KahunaSecurityConfig.contentSecurityPolicy`
([KahunaComponents](../../../kahuna/app/KahunaComponents.scala)), already allows `'self'`
scripts, styles and fonts, connections to Grid services, and images from thumbnail and imgops
origins.

Kupua's page alone is sent that policy plus `'wasm-unsafe-eval'` in `script-src`
(`KupuaPage.contentSecurityPolicy`). Justified's row packing (`@immich/justified-layout-wasm`)
is WebAssembly with no JavaScript fallback, and browsers refuse to compile WebAssembly without
that token. It permits WebAssembly compilation, not JavaScript eval. Kahuna's own pages keep
the unchanged policy. The per-page override relies on Play's `allowActionSpecificHeaders`,
enabled in `KahunaSecurityConfig`; no other Kahuna action sets security headers.

## 7. CI, Packaging and Deployment

[Grid CI](../../../.github/workflows/ci.yml) runs a "Kupua (hosted build)" step after Kahuna's
client build and before sbt: `npm install-clean`, then `npm run build:hosted`. It builds only;
Kupua's tests run locally. The npm cache key includes Kupua's lockfile. Kupua's files ship inside
`kahuna.deb`, so there is no Riff-Raff, CloudFormation or GitHub settings change.

A clean `git archive` of `kupua/` builds the same hashed bundle as a working tree. `kahuna.deb`
contains `public/kupua/` (index, JS/CSS with digest and gzip copies, images, fonts) in
`kahuna-0.1-assets.jar`, and no env or sample files.

**Deploying:** push the branch -> Grid CI -> Riff-Raff artifacts and PR comment -> the operator
deploys the needed apps to TEST (not blindly `media-service::grid::all`). Deploy media-api before
Kahuna when both change; a matching build is not an atomic cross-service rollout. Kupua-only or
Kahuna-only changes need only a Kahuna deployment.

**Removing:** `/kupua/off` returns a user to Kahuna on the experimental build. Deploying an
ordinary build removes the experiment, after which the cookie is ignored. Restore media-api too
when intentionally removing branch endpoints.

## 8. Known Limitations

- **Migrations:** Grid's `Paused` migration status is a `Running` status, so on TEST (paused
  migration) non-PIT reads span the current and migration indexes with the migrated-dedup
  filter. Sorting on a field the migration index has never mapped (configured `fileMetadata`
  aliases are the likely case) fails a shard; that read returns 503 and Kupua keeps its current
  state. The prototype accepts flakiness during migrations, which are rare, but must not refuse
  to run. Making ordered reads migration-immune (`unmapped_type` on sorts, or reading only the
  current alias) would span the shared backend and is out of scope.
- **Media:** no automatic renewal of expired links; PNG/transparency, colour, Retina and zoom
  parity with Kahuna are unverified.
- **Configuration:** the hardcoded prototype configuration may differ from TEST's.
- **Security scanning:** CodeQL on the PR flags tests, perf tooling and research HTML, which are
  never served. Check each push only for new alerts in shipped code (`kupua/src`, Kahuna,
  media-api). Serving Kupua on Kahuna's origin makes client-side injection a real concern:
  anything rendered as HTML must escape data, as keyword sort labels do.
- **Tests:** Grid suites share one Elasticsearch in CI. Media-api's `ElasticSearchTest` uses its
  own migration alias name, because thrall's `MigrationStatusProviderTest` leaves
  `Images_Migration` assigned. Running Scala tests locally with `USE_DOCKER_FOR_TESTS=false`
  must set `ES6_TEST_URL` to a disposable cluster: port 9200 may be the TEST tunnel, and the tests
  write and delete. Main's quota-bucket date test fails on machines outside UTC.

## 9. Commits and Main Candidates

Changes outside `kupua/` are kept in their own code-and-tests-only commits, one per concern, so
they can be extracted later.

- **Candidate for main:** the feature-switch panel fix (`path=/` on switch cookies). Without it,
  toggling a switch on `/images/...` scopes the cookie to that path and the switch silently does
  not apply elsewhere.
- **Goes with the Kupua endpoints:** media-api `ElasticSearchTest`'s private migration alias,
  because it protects tests added for those endpoints.
- **Experiment-only, unless Kupua hosting is adopted:** Kahuna page serving, switch, routes and
  CSP override, and the CI build step.

## 10. Open Work

1. **TEST acceptance:** operator browsing, arbitrary-position access, density changes including
   Justified, position preservation, traversal, and reload recovery after expiry. Confirm no
   browser Elasticsearch or Bedrock traffic. Invite others only after acceptance.
2. **Before users beyond TEST:** assess [GRID-016](bug-backlog.md#grid-016).
3. **Configuration, second slice:** follow the agreed
  [server-configuration workplan](kupua-TEST-01-config-via-server.md). Extend hosted inline
  injection before module initialization; include `show_paid` initial/Home defaults and
  existing domain/display settings. Laptop modes stay unchanged. BBC permission-filter and
  cost-checkbox configuration are excluded. Ticker-response metadata is an explicit next
  slice, separated to keep implementation sessions bounded. Implementation is not started.
4. **M2b:** canonical-delivery checks and targeted measurements, owned by the API build plan. Use
  the `--use-deployed-media-api` pair with and without `--canonical-media`. The perf runner
  now verifies delivery and all three dashboards distinguish it; matched campaigns remain
  operator-run and pending. See [campaign setup](../../e2e-perf/campaign-setup.md#proxy--canonical-comparison).
5. **Later media:** automatic renewal, PNG/colour/zoom parity.

Stop for unexpected infrastructure scope, serious performance risk, licence uncertainty,
conflicting settings or secret exposure. Never weaken server authorization or real-system write
safeguards. Live checks need per-session permission and stay read-only; retain no identities or
signed URLs.
