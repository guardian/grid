# Kupua: TEST Hosting — Plan and Architecture

**Status, 23 October 2026: steps 1-2 built and verified locally; step 3 (TEST) next.** This is
both the plan and the architecture record for Kupua served by Kahuna; section 5 describes what
is built. Replaces the 17 October version (branch-extraction recipe, deferred runtime config,
manifest integration).

## 1. Purpose and Authority

Serve the current read-only Kupua prototype from the existing Kahuna service on TEST. The
operator tries it first; a few invited users may follow once browsing and thumbnails work.
Not a production launch, a merge of Kupua to main, or an editing commitment. A later ordinary
Grid deployment removing it is acceptable.

This plan grants no permission by itself. Changes outside `kupua/` (Kahuna, CI, root build)
need explicit operator approval per unit. Agents never push, force-push, deploy or perform
other remote Git mutations; the operator publishes and deploys.

The [API build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md)
still owns endpoint contracts and the U7 -> M2b sequence. Step 1 below is U7's media work;
M2b's checks are unchanged. Existing browsing, authorization, data-protection and performance
safeguards apply throughout.

## 2. Decisions

**Page selection**
- Kahuna serves either its own page or Kupua's, chosen by the `feature-switch-use-kupua`
  cookie. Kahuna stays the default. Never load both apps into one document.
- Kupua is selected only for `/`, `/search` and `/images/:id`. Kupua's own detail URL lives
  under `/search`; its router already redirects legacy `/images/:id` links. Crop, takedown,
  upload, quotas and every other route keep Kahuna's handling.
- Never select Kupua for iframe requests (`Sec-Fetch-Dest: iframe`). Composer, MAM and other
  tools embed Grid as a picker; TEST tools share the site, so the cookie reaches them.
- Select Kupua only in DEV/TEST stages and only when its built assets are present; otherwise
  serve Kahuna regardless of the cookie.
- HTML responses carry `Cache-Control: no-store`; static assets cache normally.

**Switching**
- A `use-kupua` switch (default off) joins Kahuna's existing
  [feature switches](../../../kahuna/app/lib/FeatureSwitch.scala), so it appears in Kahuna's
  feature-switch panel. The panel's cookie write gains `path=/` (benefits every switch).
- Server routes `/kupua/on` and `/kupua/off` set/clear the same cookie (`Path=/`, `Secure`,
  `SameSite=Lax`, 30 days) and redirect to `/search`. Kupua's "Back to Kahuna" is a plain link
  to `/kupua/off`, so escape works even when Kupua's JavaScript is broken.
- No search/state translation across the switch. No "Try Kupua" link in Kahuna initially;
  bookmark `/kupua/on`.
- The cookie is a UI preference, not authorization; media-api checks every request.

**Packaging**
- Kupua builds independently with Vite `base: "/assets/kupua/"`. A CI step before Scala
  packaging builds it and copies only its output into a Kahuna public subtree. No manifest
  parsing, Twirl template or second source copy: Kahuna serves Vite's own `index.html` with
  one injected configuration script. Play's digest/gzip stages add copies but keep original
  filenames servable.
- Production build: development hooks stay behind `import.meta.env.DEV`; no `.env.local`,
  sample data, credentials or development proxies enter the package. The build must not run
  direct-ES or Bedrock code paths when hosted.

**Configuration**
- Kahuna injects `window.__KUPUA_CONFIG__` before Kupua's module script, from its own server
  configuration, safely serialized, explicit public fields only, no secrets.
- First slice (with the hosted page): media-api and collections addresses (plus any other
  service address Kupua calls) and hosted mode/canonical media. One build then works on local
  Grid and TEST, each talking to its own services. The laptop API-address allowlist is unchanged;
  hosted mode trusts only the address injected by the serving Kahuna.
- Second slice (after hosting works, not deferred to "deployment"): organisation, field aliases,
  image types, cost/agency-pick settings and ticker vocabulary mapped from Kahuna's config into
  Kupua's existing shape, replacing the hardcoded [grid-config](../../src/lib/grid-config.ts)
  when present. Optionally a Kahuna JSON endpoint so laptop modes can fetch TEST's real config;
  CORS from the laptop origin is unverified and the fetch would sit on the startup path.
- Settings must be in place before modules derive alias fields or construct stores. Without the
  injected object, local behaviour is exactly as today.

**Media delivery**

| Mode | Data | Media |
| --- | --- | --- |
| Sample data, `--use-TEST` | Local/TEST ES | Unchanged (sample absence, S3 proxy, imgproxy) |
| `--use-media-api`, `--use-deployed-media-api` | Local/TEST media-api | Default unchanged (proxies); `--canonical-media` opts into returned URLs |
| Hosted (local Grid or TEST) | Serving stage's media-api | Always returned URLs |

- `--canonical-media` is a [start.sh](../../scripts/start.sh) option setting
  `VITE_MEDIA_DELIVERY=canonical`; it is rejected in direct-ES modes (ES records carry no
  returned URLs). Hosted builds get the same setting without a flag. Local proxies stay.
- Thumbnails first: `thumbnail.secureUrl`, with thumbnail-availability gating updated. Then
  JPEG detail from the `optimised` link template (`optimisedPng` preferred, as Kahuna does) via a
  deliberately minimal `{&w,h,q}` expander, not a dependency, since imgops is being replaced by
  imgproxy; do not reconstruct signed URLs or bucket paths, do not double-apply server rotation, choose
  screen-appropriate bounds. PNG/transparency, colour, Retina/zoom parity and automatic renewal
  are follow-ups. Reload is the accepted recovery for expired media or authentication.
- No per-thumbnail metadata fetches; handle absent/failed media without retry loops.

**Branch and deployment**
- Close draft [PR #4967](https://github.com/guardian/grid/pull/4967). Open a new draft PR from
  the working branch `mk-next-next-next`; it must never merge. Every push builds a deployable
  artifact; nothing deploys until the operator selects it in Riff-Raff.
- Deploy Kahuna and media-api from the same build when the client needs branch endpoints.
- Changes outside `kupua/` (Kahuna, CI, root build) go in their own commits containing only
  code and tests: no Kupua files, docs or worklog. One commit per independent concern; for
  example, the panel's `path=/` cookie fix is separate from the Kupua switch and page serving.
  This keeps later extraction possible, not guaranteed clean.

**Non-goals:** no new hostname, path prefix, Node server or image service; no eelpie imgproxy
import; no durable sessions/PIT/index-migration work; deferred metadata fixes are not gates.

## 3. Evidence

### Source

| Area | Finding |
| --- | --- |
| Selection | [KahunaController](../../../kahuna/app/controllers/KahunaController.scala) already detects iframe requests and reads cookie-backed switches. The [panel](../../../kahuna/public/js/components/gr-feature-switch-panel/gr-feature-switch-panel.tsx) writes cookies without `path`. |
| Routes | [Kahuna routes](../../../kahuna/conf/routes) map `/`, `/search` and `/images/:id` to one action; crop/takedown/upload/quotas are separate. |
| CSP | [KahunaComponents](../../../kahuna/app/KahunaComponents.scala) allows `'self'`/inline scripts, connections to Grid services and images from thumbnail/full/imgops origins. |
| Media | [ImageResponse](../../../media-api/app/lib/ImageResponse.scala) supplies `thumbnail.secureUrl` and `optimised` link templates; [image helpers](../../src/lib/image-urls.ts) currently use `/s3` and `/imgproxy`; Kupua drops the image-level links envelope. |
| API access | Deployed mode already calls TEST media-api directly from the browser; Grid CORS and the panda cookie cover the Kahuna origin. [proxy-target](../../src/dal/grid-api/proxy-target.ts) allows only local `/api` and TEST. |
| Config | [grid-config](../../src/lib/grid-config.ts) is hardcoded; collections default to `localhost:9010`, which hosted mode must override. |
| Packaging | [Grid CI](../../../.github/workflows/ci.yml) builds Kahuna's client, then sbt packaging (Kahuna has digest/gzip). It does not build Kupua. CI Node (`.nvmrc`) meets Kupua's range; Kupua's build is `tsc -b && vite build`. |

### Bounded TEST Observations, 17 October 2026

Read-only, no identities, metadata, cookies or signed URLs retained. All 32 sampled search
thumbnails loaded from unsigned HTTPS CloudFront URLs; one singleton GET returned the same
thumbnail URL, a signed source URL and an `optimised` link. Detail visits requested
1800 x 1169 at quality 85. These do not establish universal thumbnail configuration or the
deployed server revision.

## 4. Order of Work

Each step is separately scoped, reviewed and approved. Kupua unit/E2E gates follow the standing
directives; Kahuna/Scala changes add relevant tests.

1. **Canonical media on the laptop (U7). DONE locally, 23 October.** `--canonical-media`,
   thumbnails then JPEG detail, in Kupua only. *Done:* grid/table/justified, selection, detail, traversal and history
   restoration show thumbnails and JPEG detail from returned URLs against deployed TEST
   media-api; all existing modes unchanged; failures degrade cleanly.
2. **Hosted page on local Grid. DONE locally, 23 October.** Kahuna switch, routes, iframe/stage/asset guards, page
   serving with first-slice config, Kupua's "Back to Kahuna" link and Vite base. Verified on
   local Grid (Grid root `start.sh`). *Done:* opt in/out via panel and routes; direct loads and
   reloads of `/`, `/search`, `/images/:id`; correct MIME/CSP/fonts/chunks; iframe and
   missing-asset requests get Kahuna; no development proxy or laptop dependency. With Grid's
   `--use-TEST`, local Kahuna/media-api run with TEST config and data, so media was realistic.
3. **TEST.** CI build step; operator opens the draft PR and deploys Kahuna + media-api. Let the
   API become ready before opting in. *Done:* operator browsing, arbitrary-position access,
   density changes, position preservation and traversal with thumbnails and JPEG detail, no
   browser ES/Bedrock traffic, reload recovery verified. Invites only after operator acceptance.
4. **Configuration, second slice.** Kahuna-sourced aliases, organisation, image types, cost and
   ticker settings; optional laptop endpoint. Lists any retained prototype defaults.

M2b's canonical-delivery checks and any targeted measurements remain owned by the API build plan.

## 5. As Built

### Delivery modes (Kupua)

- `start.sh --canonical-media` (API modes only) sets `VITE_MEDIA_DELIVERY=canonical`; every other
  mode exports `proxy`. [image-urls](../../src/lib/image-urls.ts) owns the branch.
- Thumbnails: `thumbnail.secureUrl`. No returned URL means no thumbnail, never the proxy.
- Full images: the [API mapper](../../src/dal/grid-api-search-adapter.ts) keeps each entity's
  `optimised`/`optimisedPng` hrefs as Kupua-internal `Image.__mediaLinks` (page, singleton, mget,
  AI). `getFullImageUrl` prefers PNG, fills imgops' `{&w,h,q}` with a ~10-line expander (no
  library: imgops is being replaced by imgproxy), quality 85, no added rotation (the link carries
  `r=`), both sides capped at the longer native side. Detail, carousel prefetch and zoom share it.
  Unsupported templates are absence; detail falls back to its thumbnail.
- Signed source URLs inside imgops links expire (~15-25 minutes); reload recovers.

### Hosted build (Kupua)

- `npm run build:hosted` = `tsc -b && vite build --mode hosted`. In that mode
  [vite.config](../../vite.config.ts) sets base `/assets/kupua/`, writes to Kahuna's gitignored
  `public/kupua/`, and reads env only from [hosted/.env.hosted](../../hosted/.env.hosted)
  (hosted flag, API mode, canonical media, TEST-scale thresholds). It skips loading `.env.local`
  into the process, so laptop settings cannot enter the package.
- Vite rebases paths in HTML/CSS only; literal asset paths in code must use
  `import.meta.env.BASE_URL` (the logo did not, and 404'd until fixed).
- The justified-layout WASM is inlined (base64) by its module build; Vite's "doesn't exist at
  build time" warning concerns an unused fallback.
- The bundle still contains unreachable laptop strings (`localhost:9010`, the TEST API constant);
  hosted code paths never use them.

### Runtime configuration (contract)

Kahuna inserts `<script>window.__KUPUA_CONFIG__={...};</script>` immediately after `<head>`,
before Kupua's module script, from its own server configuration:

| Field | Source | Kupua use |
| --- | --- | --- |
| `mediaApiUri` | `services.apiBaseUri` | all media-api reads; missing/invalid refuses reads (no fallback) |
| `collectionsUri` | `services.collectionsBaseUri` | collection tree; missing is quiet absence |

JSON is serialized with `<` escaped. [hosted-config](../../src/lib/hosted-config.ts) reads it
only in hosted builds and accepts only https URLs without query/fragment. Local modes never read
it. The second configuration slice adds fields here.

### Kahuna

- [UseKupua](../../../kahuna/app/lib/FeatureSwitch.scala) (`use-kupua`, default off) joins the
  feature-switch list only on DEV/TEST, so it appears in Kahuna's panel there.
- [KupuaPage](../../../kahuna/app/lib/KupuaPage.scala) holds the decision (DEV/TEST, switch on,
  not iframe) and the config injection, with [unit tests](../../../kahuna/test/lib/KupuaPageTest.scala).
- [KahunaController.index](../../../kahuna/app/controllers/KahunaController.scala), still inside
  the existing login redirect, reads `public/kupua/index.html` per opted-in request (so a rebuild
  appears without restart). Present and renderable: Kupua with `Cache-Control: no-store`.
  Otherwise Kahuna's ordinary page. Covers `/`, `/search`, `/images/:id`; crop, takedown, upload,
  quotas keep Kahuna.
- `/kupua/on` (DEV/TEST only, else 404) sets `feature-switch-use-kupua=true` with `Path=/`,
  `Secure`, `SameSite=Lax`, 30 days; `/kupua/off` clears it. Both redirect to `/search`. Not
  HttpOnly, because Kahuna's panel reads switch cookies client-side.
- Kupua's Settings menu has "Back to Kahuna", a plain link to `/kupua/off`.
- No CSP change was needed: Kahuna's policy already allows `'self'` scripts/styles/fonts,
  connections to Grid services and images from thumbnail/imgops origins.
- Assets are served by Kahuna's existing `/assets/*file` route; Play's digest/gzip stages keep
  Vite's hashed names servable. Kahuna dev mode picks up a rebuilt `public/kupua/` without restart.

### CI and packaging

- [Grid CI](../../../.github/workflows/ci.yml) has a "Kupua (hosted build)" step after Kahuna's
  client build and before sbt: `npm install-clean` then `npm run build:hosted` in `kupua/`. Build
  only, no Kupua tests (they run locally and take minutes). The npm cache keys include Kupua's
  lockfile. No Riff-Raff, CloudFormation or GitHub settings change: the files ride inside
  `kahuna.deb`.
- Verified 23 October: a clean `git archive` of `kupua/` installs from the lockfile and builds
  the same hashed bundle as the working tree; a local `sbt kahuna/Debian/packageBin` puts
  `public/kupua/` (index, JS/CSS with digest and gzip copies, images, fonts) into
  `kahuna-0.1-assets.jar`, with no env or sample files.

### Commits and main candidates

Outside-kupua code is kept in code+tests-only commits. The feature-switch panel fix
(`path=/` on switch cookies) is an independent Kahuna bug fix and a **candidate for main** as its
own small PR: without it, toggling a switch while on `/images/...` scopes the cookie to that path
and the switch silently does not apply elsewhere. The Kahuna serving change is experiment-only
unless Kupua hosting is later adopted. The CI step (step 3) likewise.

### Verification so far

Kupua unit/E2E and hosted build pass; Kahuna `KupuaPageTest`/`FeatureSwitchesTest` pass. On local
Grid (`--use-TEST`): routes and cookie attributes, asset MIME types, login before Kupua, and the
operator's browser check (opt in/out, panel switch, browsing with canonical media) passed.

## 6. Deployment and Removal

Chain: PR push -> `Grid CI` -> Riff-Raff artifacts and PR comment -> operator-selected TEST
deployment of the needed apps (not blindly `media-service::grid::all`). A matching build is not
an atomic cross-service rollout.

Recovery: `/kupua/off` (or clearing the cookie) returns to Kahuna on the experimental build;
deploying an ordinary build removes the experiment, after which the old cookie is ignored.
Restore media-api too when intentionally removing branch endpoints.

## 7. Stop Conditions and Limits

Stop for unexpected infrastructure scope, serious performance risk, licence uncertainty,
conflicting settings or secret exposure. Never weaken server authorization or real-system write
safeguards. Live checks need per-session permission and stay read-only; retain no identities or
signed URLs. [GRID-016](bug-backlog.md#grid-016) must be assessed before serving users beyond TEST.
