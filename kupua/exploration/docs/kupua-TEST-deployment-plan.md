# Kupua: Temporary TEST Deployment Plan

**Status: agreed direction; implementation not started. 17 October 2026.**

## 1. Purpose and Authority

Deploy the current read-only Kupua prototype through the existing Kahuna service
on TEST. The operator tries it first; a few invited users may follow once browsing
and thumbnails work. This is not a production launch, a proposal to merge Kupua
to main, or a requirement to implement editing. Even a short working session is
useful. A later ordinary Grid deployment removing Kupua is explicitly acceptable.

This document records decisions and implementation checks. It does not authorise
deployment, Git mutations, live-system probes or changes outside Kupua. Obtain
the applicable permission when executing each unit. Agents NEVER push, force-push,
publish PRs or perform other remote Git mutations, including through scripts or
GUI automation. The operator publishes, normally using GitHub Desktop, and is
willing to learn and run explained terminal commands where Desktop is insufficient.

The [API build plan](03%20Ce%20n'est%20pas%20une%20pipe%20dream/api-build/api-build-00-plan.md)
continues to own endpoint contracts and migration. This plan owns the newly
selected hosting experiment. Its staged acceptance deliberately allows a hosted
shell without media, then thumbnails without full-image delivery. That does not
complete U7/M2b's full canonical-media scope. Existing browsing, authorization,
data-protection and performance safeguards still apply.

## 2. Decisions and Non-Goals

- Serve a separate Kupua HTML shell from Kahuna, selected by an opt-in cookie.
  Kahuna remains the default. Never load both frontends into the same document.
- Use the existing TEST host and deployment infrastructure. No separate hostname,
  application path prefix, Node/Vite server or new image service is selected.
- Switching rather than simultaneous same-browser use is acceptable. The cookie
  is shared across tabs on its host; separate browser profiles/private sessions
  can hold different preferences and require their own login.
- Preserve all current local modes, including sample data, direct TEST ES, local
  media-api and deployed media-api, with their local S3 proxy and imgproxy delivery.
- Prioritise thumbnails. JPEG detail follows separately; rare optimised PNGs and
  comprehensive format/zoom parity are later work.
- Reload to recover authentication or expired media is acceptable initially.
  Verify recovery works; automatic renewal is not an initial gate.
- Reuse draft [PR #4967](https://github.com/guardian/grid/pull/4967) and its branch
  `mk-test-kupua-media-api`. History is disposable; the PR must never merge.
- The deployment branch includes application/build inputs and relevant tests,
  fixtures and required dependency licences. Exclude research, planning documents,
  worklogs and unrelated experiments. Required legal notices are not optional.
- Do not import eelpie's imgproxy infrastructure, redesign service discovery, add
  durable sessions/PIT/index-migration support, or make deferred metadata fixes
  new deployment prerequisites.
- Justified's production-build/licensing restriction is acknowledged. Resolve any
  desired availability change separately before shipping it. Do not bypass the
  gate by deploying a development-mode bundle.

## 3. Evidence and Limits

### Source Inspection

| Area | Evidence and consequence |
| --- | --- |
| Page selection | [KahunaController](../../../kahuna/app/controllers/KahunaController.scala) handles login redirects and reads cookie-backed [feature switches](../../../kahuna/app/lib/FeatureSwitch.scala), including a server-side switch getter. |
| HTML/configuration | [Current template](../../../kahuna/app/views/main.scala.html) renders assets, service links and `_clientConfig`. [KahunaConfig](../../../kahuna/app/lib/KahunaConfig.scala) and [Services](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/Services.scala) know additional settings not serialized into that object. |
| Routes | [Kahuna routes](../../../kahuna/conf/routes) include upload, crop and takedown. [Kupua's router](../../src/router.ts) registers only home, search and image detail; its image route redirects into search detail state. |
| Thumbnails | [ImageResponse](../../../media-api/app/lib/ImageResponse.scala) supplies `thumbnail.secureUrl`: configured CloudFront or signed S3. [API mapping](../../src/dal/grid-api-search-adapter.ts) retains it; [image helpers](../../src/lib/image-urls.ts) currently ignore it and use the local proxy. |
| Full images | Responses supply `optimised` and optional `optimisedPng` link templates. [Kahuna's imgops service](../../../kahuna/public/js/imgops/service.js) follows them. Kupua currently drops the image-level links envelope. |
| Expiry | [RoundedExpiration](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/RoundedExpiration.scala) normally gives signed URLs approximately 15-25 minutes; underlying credentials may expire earlier. Loaded pixels do not disappear on expiry, but subsequent requests with stale URLs can fail. |
| Authentication | Initial login redirects can remain shared. [Kahuna's browser bootstrap](../../../kahuna/public/js/main.js) has additional authentication handling which Kupua does not inherit by sharing a host. |
| Local dependencies | [Startup](../../scripts/start.sh) supplies modes and local media settings; [Vite](../../vite.config.ts) owns development proxies. These proxies are not part of built browser assets. |
| Runtime config | [grid-config](../../src/lib/grid-config.ts) is hardcoded; [discovery](../../src/dal/grid-api/service-discovery.ts) does not fetch Kahuna's client config. Field definitions and the datasource store initialize during module loading. |
| Packaging | [Grid CI](../../../.github/workflows/ci.yml) builds Kahuna, then runs Scala compilation/tests and Debian packaging. [build.sbt](../../../build.sbt) gives Kahuna a digest/gzip asset pipeline. CI does not currently build Kupua. |

### Bounded TEST Observations, 17 October 2026

Read-only inspection used real TEST Kahuna, not local Grid. No image identities,
metadata, cookies or signed URL strings are retained here.

- All 32 sampled search thumbnails had loaded from unsigned HTTPS CloudFront URLs.
- One singleton image GET returned a thumbnail URL identical to the displayed URL.
  Its source URL was signed and its ordinary `optimised` link was present.
- An 800-pixel JPEG probe loaded an 800 x 533 preview. This was a requested size,
  not an imgops limit.
- Two ordinary detail visits requested a 1800 x 1169 box at quality 85 and loaded
  1753 x 1169 images. This does not certify performance, colour, maximum resolution
  or every format.
- The browser returned to the original search URL; temporary guards were removed.
  No application settings or image data were changed.

These observations do not establish universal thumbnail configuration, current
availability of Kupua-specific endpoints, or the deployed server revision.
PR #4967's inspected bot comment links build 15493; that does not prove it is live.
The local branch comparison found 36 media-api files changed in the inspected
existing Grid surfaces since the common ancestor with local main. It did not
establish remote freshness or equality with the old PR.

## 4. Hosting and Packaging

Keep React/Vite independent of Kahuna's Angular/Webpack build. Add a dedicated
hosted-build command and CI step before Scala packaging. Build into a Kupua-owned
output directory, then copy only its output to a distinct Kahuna public subtree.
An illustrative URL base is `/assets/kupua/`: an asset namespace, not a new app route.

Use Vite's supported [backend integration](https://vite.dev/guide/backend-integration)
and manifest to locate entry scripts, CSS and imported CSS/chunks. Do not hardcode
generated hashes or maintain another frontend source copy under Kahuna. Ensure
the manifest is accessible in the packaged application; choose an explicit
filename/location if hidden-file packaging is a problem.

The implementation must prove:

- Play serves Vite's referenced filenames alongside its digest/gzip pipeline,
  including dynamic imports, CSS assets, fonts and favicon.
- Asset paths work on direct `/search` and `/images/:id` loads, not just the root.
- Packages contain the manifest and generated assets, but no local configuration,
  credentials, sample data or developer-only output.
- Hosted builds explicitly select API mode, do not run development-only AWS
  probes, and do not depend on `.env.local`. Account for Vite-imported local
  tooling as build inputs even when its runtime functionality is disabled.
- A clean extraction installs from the committed lockfile and builds without
  the original working tree. CI's inspected Node version meets Kupua's range.

No CloudFormation or Riff-Raff topology change is currently expected. Stop and
justify any discovered need to expand infrastructure scope.

### Template, Cookie and Escape

Render a dedicated template with Kupua's root, CSS, module script and explicit
public configuration. Retain the existing login boundary. The ordinary Kahuna
path must not require Kupua assets when absent; check availability before selecting
the experimental shell.

Use a default-off switch restricted to the intended TEST experiment and explicit
local verification. Set a host-scoped cookie with `Path=/` and appropriate
Secure/SameSite attributes; choose its lifetime explicitly. The existing widget
omits a path and is not sufficient unchanged. Switching reloads/navigates the
document rather than mounting the second app inside the first.

Select Kupua only for supported home/search/image routes. Upload, crop, takedown,
quotas and other Kahuna routes retain existing handling. Do not promise lossless
URL/state translation; returning to a safe search page is acceptable for this trial.

Provide a server-handled clear/bypass route usable when Kupua JavaScript is broken.
Verify normal Kahuna with absent/false cookies, missing Kupua assets and after an
ordinary build replaces the experiment. Prevent shared HTML caching from serving
one user's selection/configuration to another; static asset caching is separate.
The cookie is a UI preference, not data authorization.

## 5. Configuration and Local Preservation

Prefer a small configuration object rendered before Kupua's module executes,
sourced from existing Kahuna server configuration. Safely serialize explicit public
fields, not the whole server config or arbitrary string interpolation. No secrets.

| Category | Initial treatment |
| --- | --- |
| API address, hosted mode, media delivery | Explicit hosted settings; no accidental Vite proxy, localhost, browser ES or Bedrock fallback on TEST. |
| Collections address | Existing server service address; not currently part of `_clientConfig`. Preserve optional-data absence handling. |
| Organisation, aliases, image types, applicable warnings and feature vocabulary | Map existing server values into Kupua's shape. List retained prototype defaults rather than claiming complete parity. |
| Agency-pick colour/ingredients | Values already exist; colour currently enters Kahuna CSS rather than its client object. |
| Tickers and derived presentation | Identify the current consumer contract without expanding into deferred ticker/enrichment redesign. |
| AI and image URLs | Preserve API capability and entity contracts; do not replace returned links with hardcoded bucket knowledge. |
| Kupua-only UI/performance tuning | Keep current defaults unless hosted operation needs a specific difference. |

Initialize settings before imports derive alias fields or construct stores. A
post-render assignment is insufficient. Without the hosted payload, local operation
keeps its established configuration. Preserve safeguards; do not broadly relax the
current API target allowlist.

Treat data transport and media delivery as independent choices:

| Mode | Data | Media |
| --- | --- | --- |
| Local sample setup | Existing local ES | Existing sample/absence behaviour |
| Local `--use-TEST` | Existing guarded TEST ES | Existing local S3 proxy and imgproxy |
| Local `--use-media-api` | Existing local API proxy | Existing local S3 proxy and imgproxy |
| Local `--use-deployed-media-api` | Existing direct TEST API | Existing local S3 proxy and imgproxy |
| Hosted TEST | Matching deployed TEST API | Canonical thumbnails; initially absent full images, then imgops JPEGs |

An explicit local canonical-media option may help verification, but must not
silently change existing modes. Hosted failures never fall back to laptop services.
Do not delete the local proxies as part of the canonical-media work.

## 6. Implementation Units

Each unit is separately scoped and reviewed. Obtain outside-Kupua write permission
before changes to Kahuna, media-api, CI or root build files. None is started.

### A. Shell Proof

Implement hosted build/packaging, template, configuration entry point, default-off
selection and server-side escape. Preserve ordinary Kahuna and local Kupua.

**Done:** the operator can opt in, load the production-built shell and assets,
refresh supported deep links and return to Kahuna. Missing media or unavailable
prototype endpoints are acceptable for this labelled shell proof. No invites yet.

### B. API Browsing and Thumbnails

Pair the client with required API changes in the experimental build. Consume
`thumbnail.secureUrl` in canonical mode and update thumbnail-availability gating.
Preserve synthetic fixtures and local delivery. Cover grid/table, selection images,
standalone detail fallback and history restoration.

Do not fetch metadata per thumbnail: page/singleton/mget/AI records already carry
assets. Handle absent/failed media without retry loops. Signed-S3 configurations
initially use reload recovery; sampled TEST CloudFront thumbnails have no signed
expiry. Do not infer every possible TEST record has the sampled delivery shape.

**Done:** operator browsing, arbitrary-position access, density changes, position
preservation and traversal work with thumbnails and no laptop dependency or browser
ES/Bedrock traffic. Keep existing limits/approximations. Verify reload-based login
recovery. Invite others only after operator acceptance.

### C. JPEG Detail

Retain canonical image-level links through API mapping and relevant image lifetimes.
Expand `optimised` with a suitable existing/library URI-template implementation;
do not reconstruct signed URLs or bucket paths. Choose screen/detail-appropriate
bounds, not a fixed 800-pixel ceiling. Do not double-apply rotation already supplied
by the server link.

**Done:** ordinary JPEG detail/traversal works through TEST imgops with clean failure
fallback and unchanged local imgproxy. Reload on expiry is acceptable. PNGs,
transparency, colour, Retina/zoom parity and bounded automatic renewal remain
explicit follow-ups, not certified by the JPEG checks.

## 7. Reusable Deployment Branch

Working source is `mk-next-next-next`; deployment source is `mk-test-kupua-media-api`,
backing PR #4967. Its history can be replaced; the working branch is not rewritten
by regeneration. Keep short build notes in the PR description, not a second archive.

### Regeneration Recipe

1. Operator obtains current main, merges it into the working branch and resolves
   conflicts once. Agents do not automate merges or conflict decisions.
2. Identify exact main and committed source revisions; verify main is an ancestor
   of source. Otherwise stop. Do not silently include uncommitted work.
3. Read-only preparation enumerates approved additions, modifications and deletions
   relative to that exact main for operator review.
4. With explicit local Git/filesystem permission, prepare a clean candidate based
   on that main, preferably without switching the active working tree. Overlay
   approved resolved source files and intended deletions.
5. Check its diff against main exactly matches the selection. No research, secrets,
   local config or unrelated changes. Shared files containing unrelated changes
   need an explicit decision, not wholesale copying or a second invented resolution.
6. Build/test the clean candidate. Record main/source revisions and selected patch
   identity. Validation only in the all-inclusive working tree is insufficient.
7. With approval at that point, replace the local deployment branch with the
   validated candidate. Agree how to retain the previous candidate. This is not
   blanket permission for resets, branch switches or worktree deletion.
8. Operator updates the remote branch. Replacing history normally needs
   force-with-lease, checked against the expected remote tip. Unexpected remote
   movement stops the procedure. The agent NEVER executes this push.
9. The existing PR stays open and receives new checks/artifacts. Operator updates
   its description/title as useful. Never merge it.

There is no independent main merge/conflict resolution on the deployment branch.
Copying files alone does not transfer ancestry: start the candidate at the exact
main commit. If main advances afterward, deliberately refresh again; do not claim
the branch can never become behind.

### Extraction List and Assistance

Maintain an exact extraction list as implementation progresses. Expected areas:
Kupua source/assets/package/lockfile/build inputs/tests; selected media-api code,
tests and fixtures; a bounded Kahuna controller/template/config/switch/test patch;
the CI build step; root build changes only if demonstrated necessary.

Include transitive build inputs, new files and deletions. Vite's imports of local
tooling are one reason copying only `src` is insufficient. Exclude research, plans,
worklogs, environment files, credentials, dependencies installed on the laptop,
reports, recordings and generated bundles. Retain necessary licence notices.

A small local helper can later inventory, assemble and validate exact revisions
and an explicit allowlist. Default to dry-run; no hidden fetch, merge, conflict
resolution, push or deployment. Do not build a general release framework.

GitHub Desktop is preferred, not mandatory. Verify its actual force-update flow
at execution time rather than promising a button. Where needed, provide terminal
commands individually with their purpose, expected effect and checks explained.
Operator is willing to learn them and runs every publishing command personally.
Prefer a reviewed force-with-lease over unrestricted force; a rejected lease means
investigate, not retry with weaker protection. Scripts must not conceal publishing.

## 8. Build, Deployment and Removal

**Chain:** PR update -> GitHub Actions `Grid CI` -> frontend builds and Scala
tests/Debian packages -> `guardian/actions-riff-raff` artifact publication and PR
comment -> operator-selected Riff-Raff TEST deployment. CloudFormation defines
infrastructure; it does not build the PR. CI artifact publication is distinct from
an agent pushing Git state or deploying the app.

Identify the successful build and source revisions. Use matching Kahuna/media-api
packages when the live API lacks required contracts. Review selected applications
and their deployment dependencies; `media-service::grid::all` is a project name,
not an instruction to deploy everything. Do not blindly use an all-app link.

A matching build is not an atomic cross-service rollout. Let the required API
become ready before opting into the client; record rolling-deployment limits.
An ordinary Kahuna search does not prove Kupua endpoint compatibility.

Recovery has two levels:

- Clear/bypass the cookie to use Kahuna on the experimental build.
- Operator deploys a known ordinary build to remove the experiment. Confirm the
  old cookie is ignored and Kahuna works. Restore media-api too when removing
  experimental endpoints intentionally. Deployment does not erase existing browser
  tabs, logs or deployment records.

## 9. Verification and Stop Conditions

Follow standing test directives, failing-first checks and full required surfaces.
Run npm scripts from repo root with `set -o pipefail` and live output ending at
`tee "$TMPDIR/kupua-test-output.txt"`. Coordinate ports/servers before E2E; never
stop the operator's app implicitly. Agents do not run performance campaigns.

Required evidence scales with the unit:

- Switch defaults, stage eligibility, routes, missing assets, safe config
  serialization/initialization and JavaScript-independent escape tests.
- Kupua units/build and required local E2E after source/DAL/UI changes; relevant
  Kahuna/Scala tests for server changes. Preserve ordinary Kahuna CI.
- Clean extracted build and packaged-asset smoke check: MIME types, CSP, fonts,
  chunks, deep links/reloads and independence from development proxies.
- Local-mode regression coverage for section 5. Fixtures prove routing, not live
  TEST behaviour. Live checks need per-session permission and remain read-only.
- Bounded useful-trial checks of core browsing and thumbnails, including optional
  collections/AI without expanding their scope. Retain no identities or signed URLs.
- Suggest targeted media/traversal measurements for affected render paths using
  existing M2a evidence, not another automatic whole-system campaign. Local-media
  measurements do not certify canonical delivery.

Stop for unexpected dependency expansion, unselected extraction changes, a
non-ancestor baseline, remote movement, conflicting settings, serious performance
risk, licence uncertainty or secret exposure. Never weaken server authorization or
real-system write safeguards to make the experiment work.

No implementation, builds, tests, branch regeneration or deployment have been
performed for this plan. Packaged manifest behaviour, Desktop publishing mechanics,
current TEST API compatibility and complete configuration mapping remain execution
checks rather than facts established by this research.