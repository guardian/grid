# Bread-and-Butter Workplan: Phase 0 + Read-Only API-First Hybrid

*Written April 2026, after a long Copilot session reasoning through the inflection point.*

> **What this is:** A concrete, sequenced workplan for the next phase of kupua,
> grounded in the realisation that (a) the de-risking phase is done, (b)
> bread-and-butter features are now needed, and (c) those features are
> *exactly* where API-first pays off most — without requiring any Scala work.
>
> **What this isn't:** A replacement for `integration-plan-api-first.md`. That
> doc remains the long-form architectural plan. This doc is the practical
> "what do we do *next*, in what order, with what guardrails" companion.

---

## Table of Contents

1. [The strategic situation](#the-strategic-situation)
2. [The hybrid approach in one paragraph](#the-hybrid-approach-in-one-paragraph)
3. [Pre-flight: performance validation gate](#pre-flight-performance-validation-gate)
4. [Phase 0 — Dev-nginx, auth, service discovery](#phase-0--dev-nginx-auth-service-discovery)
5. [Phase A — API adapter foundation (scaffolding)](#phase-a--api-adapter-foundation-scaffolding-no-user-visible-features)
6. [After Phase A — cluster decomposition](#after-phase-a--cluster-decomposition)
7. [Phase B — Read operations through HATEOAS (legacy framing; superseded by clusters)](#phase-b--read-operations-through-hateoas)
8. [Phase C — Write operations through HATEOAS actions](#phase-c--write-operations-through-hateoas-actions)
9. [Architectural rule: where each call goes](#architectural-rule-where-each-call-goes)
10. [Agent guardrails](#agent-guardrails)
11. [Branching and commit hygiene](#branching-and-commit-hygiene)
12. [Stop conditions](#stop-conditions)
13. [Decision log to maintain](#decision-log-to-maintain)

---

## The strategic situation

After ~20k lines of kupua development, we are at an inflection point:

- **Validated by direct-ES build:** windowed buffer, scrubber, position maps,
  aggregations, deep seek, sub-100ms scroll. The exotic "kahuna can't do this"
  features work against the real 1.3M-doc TEST cluster.
- **Not yet validated:** scaling. Nobody has measured what kupua's query
  patterns cost the cluster under realistic concurrent load. The slow log on
  TEST is currently effectively off (thresholds unset).
- **Not yet built:** every bread-and-butter feature kahuna has — image
  detail with cost/validity badges, collections, cropping, metadata editing,
  leases, usages, labelling, archiving, syndication, upload, deletion.
- **Owned by:** one non-engineer (mk) plus a rotating cast of Claude agents.
  No Scala collaborator yet committed.

Two routes are open:

1. **Direct-ES bread-and-butter.** Continue as before. Everything runs through
   ES. Replicate `CostCalculator`, `is:` filters, validity rules, permission
   logic in TypeScript. Build a production S3 URL story to replace the dev
   proxy. Estimated cost: large, and the result drifts from kahuna over time.

2. **API-first bread-and-butter (read-only).** Use `GET /images/{id}` and the
   HATEOAS surface that *already exists* in media-api today. Cost, validity,
   signed URLs, persistence reasons, action links — all server-computed.
   No Scala work needed for read paths. **Writes** also use endpoints that
   already exist (metadata-editor, cropper, leases, collections services), so
   even Phase C requires zero Scala changes — only kupua-side wiring.

This document chooses **route 2**, but explicitly preserves route 1 for the
search-windowing/scrubber/aggregation paths kupua has already built. That's
the hybrid. It is the only route that:

- Requires zero Grid (Scala) changes for the entire bread-and-butter phase.
- Doesn't require a Scala reviewer commitment to start.
- Stops kupua from replicating logic that lives in kahuna.
- Keeps every existing kupua feature working unchanged.

---

## The hybrid approach in one paragraph

> **Search-shape data flows continue to use the existing direct-ES adapter.
> Everything else — image detail, edits, crops, leases, usages, collections,
> upload, delete — goes through media-api's existing HATEOAS surface, with
> auth via the same Guardian cookie kahuna uses.** Two adapters coexist
> behind the existing `ImageDataSource`-style abstraction, with a clear rule
> about which one each call type uses. The API-first plan's Phases 1–4
> (Scala work to add `search_after`, PIT, aggregations endpoints) are
> **deferred indefinitely** — only revisited if (a) we find a Scala
> collaborator AND (b) performance work or production deployment justifies
> migrating search itself.

---

## Pre-flight: performance validation gate

**This must happen before any code in this workplan is written.**

The conversation that produced this document surfaced a hard truth: we don't
know if kupua's query patterns scale. We have one user (mk), no slow log
data, and nothing in Kibana or Grafana scoped to kupua-shape queries. Every
hour spent on bread-and-butter features is bet on the assumption that the
foundation holds at scale. That assumption is unvalidated.

The cheapest, most informative experiment available is:

### Step 1 — Enable slow log on TEST images index

Send a Slack message to whichever Guardian engineer owns the ES cluster (or
who reviews Grid PRs touching ES). Suggested message:

> "Could you enable the search slow log on TEST's current images index?
> Suggested thresholds: `info: 500ms`, `warn: 2s`, `fetch.info: 200ms`,
> `fetch.warn: 1s`. I want to see kupua's query patterns in Kibana to
> understand whether they'd scale beyond a single user. Fully reversible
> — happy for you to do it or hand me the API call."

The setting is per-index, scoped to TEST, and reversible:

```
PUT /<images-index>/_settings
{
  "index.search.slowlog.threshold.query.warn": "2s",
  "index.search.slowlog.threshold.query.info": "500ms",
  "index.search.slowlog.threshold.fetch.warn": "1s",
  "index.search.slowlog.threshold.fetch.info": "200ms"
}
```

ES service logs already ship to Guardian's Kibana. Once thresholds are set,
slow queries appear there automatically — no pipeline work needed.

### Step 2 — Generate kupua-shape load and measure

Spend 20 minutes using kupua against TEST, doing a typical session: scroll,
scrubber drag, filter changes, deep seek, scroll back. Then in Kibana:

- Filter by TEST nodes, `logger:*slowlog*`, last 1 hour
- Examine entries: which queries appear, how often, with what duration
- Group mentally by query shape (composite agg, search_after page,
  position-map chunk, percentile estimation)

### Step 3 — Decide

| What you find | What it means | Next step |
|---|---|---|
| **Zero slow log entries** | All kupua queries < 500ms server-side. Scaling concern is mostly network/concurrency, not query cost. | Proceed with the workplan below. Revisit if real-user pilot surfaces issues. |
| **A few entries (1–5/min), one query shape repeats** | One named, fixable problem. | Look at that query. Cache it? Reduce cardinality? Async-warm it? Then proceed. |
| **Many entries, multiple query shapes** | Foundation is shaky. | Stop. Don't add more features on top. Conversation with Guardian engineer needed. Possibly redesign of scrubber/position-map approach before more building. |

**The output of step 3 dictates the rest of the plan.** Do not skip this gate.
Building bread-and-butter features on an unscalable foundation is the worst
possible failure mode — it makes kupua look feature-complete while being
unshippable.

### Step 4 (optional) — Real-user pilot on TEST

Independent of slow log, identify 3–5 colleagues who'd try kupua against TEST
for a week. This generates concurrent-user data nothing else can. **Do not
gate the workplan on this** — proceed with phases below in parallel.

---

## Running both projects locally — the practical setup

> **Read this before Phase 0.** Without a working "both projects up at once"
> setup, none of the API-first work below is testable end-to-end. The good
> news: ports don't clash (with one exception, easily resolved), and the
> moving parts are well-defined. The bad news: this has never been tried
> before, so expect surprises in Phase 0 — that's *exactly* what Phase 0
> is for.

### Port map — who listens where

**Grid (full local mode):**

| Port | Service | Source |
|---|---|---|
| 9001 | media-api | [build.sbt](build.sbt#L161) |
| 9002 | thrall | [build.sbt](build.sbt#L173) |
| 9003 | image-loader | [build.sbt](build.sbt#L148) |
| 9005 | kahuna | [build.sbt](build.sbt#L155) |
| 9006 | cropper | [build.sbt](build.sbt#L146) |
| 9007 | metadata-editor | [build.sbt](build.sbt#L171) |
| 9008 | imgops (nginx-based image resizer) | [docker-compose.yml](docker-compose.yml) |
| 9009 | usage | [build.sbt](build.sbt#L196) |
| 9010 | collections | [build.sbt](build.sbt#L144) |
| 9011 | auth | [build.sbt](build.sbt#L142) |
| 9012 | leases | [build.sbt](build.sbt#L159) |
| 9014 | oidc-provider (local auth shim) | [docker-compose.yml](docker-compose.yml) |
| 9090 | Cerebro (ES UI) | [docker-compose.yml](docker-compose.yml) |
| 9200 | Elasticsearch (Docker container OR SSH tunnel to TEST) | [docker-compose.yml](docker-compose.yml) |
| 4566 | LocalStack (S3, DynamoDB, SQS, Kinesis, etc.) | [docker-compose.yml](docker-compose.yml) |

**Kupua:**

| Port | Service | Source |
|---|---|---|
| 3000 | Vite dev server | [kupua/vite.config.ts](kupua/vite.config.ts) |
| 3001 | s3-proxy.mjs (TEST mode only) | [kupua/scripts/s3-proxy.mjs](kupua/scripts/s3-proxy.mjs) |
| 3002 | imgproxy container (TEST mode only) | [kupua/docker-compose.yml](kupua/docker-compose.yml) |
| 9220 | Kupua's own Elasticsearch (local mode only) | [kupua/docker-compose.yml](kupua/docker-compose.yml) |

**The good news:** kupua deliberately uses ports nobody else wants — 3000,
3001, 3002, 9220. None of these collide with Grid's 9001–9014 or 4566.

**The one collision: port 9200.**
- Grid in *full local mode* runs Docker Elasticsearch on 9200 ([docker-compose.yml](docker-compose.yml))
- Grid in `--use-TEST` mode opens an SSH tunnel to TEST ES on 9200 ([dev/script/start.sh](dev/script/start.sh))
- Kupua in `--use-TEST` mode also wants an SSH tunnel to TEST ES on 9200 ([kupua/scripts/start.sh](kupua/scripts/start.sh))

Resolution depends on which combination you pick — see the three setups
below.

### Three sensible setups

There are exactly three combinations that make sense for bread-and-butter
work. Pick one based on what you're doing.

#### Setup A — Both local, sharing Grid's ES (recommended for first integration)

**When to use:** Phase 0 and early Phase A scaffolding. You're testing wiring, not
realistic data. You want everything self-contained so failures are easy
to diagnose.

**What runs:**
- Grid, full local mode: `dev/script/start.sh` (no flags)
  - Docker ES on **9200**, LocalStack on 4566, OIDC on 9014, all Play apps
  - Local sample data — handful of test images, no real thumbnails
- Kupua, in "use Grid's ES" mode: `kupua/scripts/start.sh --skip-es` plus
  `KUPUA_ES_URL=http://localhost:9200`
  - Vite on 3000, no Docker ES (skipped), no s3-proxy needed
  - Search adapter queries Grid's ES; API adapter calls Grid's media-api
  - Both sides see the same images → IDs returned by search exist when
    media-api looks them up

**Steps (fresh start):**

1. **Terminal A — start Grid:**
   ```bash
   cd ~/code/grid
   ./dev/script/start.sh
   ```
   Wait until all Play apps log "Listening for HTTP". Verify:
   ```bash
   curl http://localhost:9200/_cluster/health    # ES alive
   curl http://localhost:9001/management/healthcheck    # media-api alive
   ```
   Also load some sample data into Grid's ES — Grid has its own data-loading
   scripts ([dev/script/](dev/script/)). Without data, search returns
   nothing and you can't test the integration.

2. **Terminal B — start kupua:**
   ```bash
   cd ~/code/grid
   KUPUA_ES_URL=http://localhost:9200 ./kupua/scripts/start.sh --skip-es
   ```
   *(Note: the script flag is parsed by `kupua/scripts/start.sh`. Check the
   actual `package.json` script wrapper — you may need to invoke
   `./kupua/scripts/start.sh --skip-es` directly with the env var prefixed.)*

3. **Visit:**
   - Kahuna: `https://media.local.dev-gutools.co.uk` (login via OIDC)
   - Kupua: `https://kupua.media.local.dev-gutools.co.uk` (after Phase 0
     dev-nginx mapping is added)

**Pros:** Self-contained, no AWS dependencies, no SSH tunnel, no real-data
risk. Easy to nuke and restart.

**Cons:** Tiny dataset, no real thumbnails, no realistic field variety.
You're testing plumbing, not behaviour.

**Auth notes:** Both apps live under `.local.dev-gutools.co.uk`. The
pan-domain auth cookie set by kahuna's OIDC login should be visible to
kupua's origin. **Verify in Phase 0 step 0.3** — this is the single
biggest unknown.

---

#### Setup B — Both `--use-TEST`, sharing one SSH tunnel (recommended for real-data dev)

**When to use:** Most of Phase A scaffolding and all clusters thereafter. You want realistic data
(1.3M images, real metadata, real thumbnails) so the bread-and-butter
features look plausible.

**What runs:**
- Grid, TEST mode: `dev/script/start.sh --use-TEST`
  - Opens SSH tunnel to TEST ES on **9200**
  - Stops Grid's Docker ES
  - Pulls TEST config from `s3://grid-conf/TEST/`
  - Runs Play apps locally (`runMinimal`) pointed at TEST data and S3
  - Domain root: `test.dev-gutools.co.uk` (apps think they're TEST)
- Kupua, TEST mode: `kupua/scripts/start.sh --use-TEST`
  - **Detects the existing tunnel** ([kupua/scripts/start.sh](kupua/scripts/start.sh))
    line ~219: "Re-using existing SSH tunnel to TEST ES (port 9200)"
  - Skips its own Docker ES (would conflict with the tunnel)
  - Starts s3-proxy on 3001 and imgproxy on 3002 for thumbnails
  - Vite on 3000 with `VITE_ES_IS_LOCAL=false` (write protection on)

**Steps (fresh start):**

1. **Get AWS credentials:** Janus → media-service profile. Verify:
   ```bash
   aws sts get-caller-identity --profile media-service
   ```

2. **Terminal A — start Grid in TEST mode:**
   ```bash
   cd ~/code/grid
   ./dev/script/start.sh --use-TEST
   ```
   This opens the SSH tunnel and starts Play apps. Wait for "Listening for
   HTTP" on all services.

3. **Terminal B — start kupua in TEST mode:**
   ```bash
   ./kupua/scripts/start.sh --use-TEST
   ```
   You should see: *"Re-using existing SSH tunnel to TEST ES (port 9200) ✓"*
   in green. If it tries to open a new tunnel instead, port 9200 is held by
   something else — investigate.

4. **Visit:**
   - Kahuna: `https://media.local.dev-gutools.co.uk` (still local-domain
     URLs — dev-nginx routes to localhost)
   - Kupua: `https://kupua.media.local.dev-gutools.co.uk`

**Pros:** Real data, real images, realistic query latency. Best fidelity
for actually evaluating bread-and-butter UX.

**Cons:** Requires AWS credentials, periodic credential refresh, SSH
tunnel can flake. Touches the shared TEST cluster — but read-only by
default ([kupua's safeguards](kupua/exploration/docs/infra-safeguards.md)
prevent writes).

**Verified Phase 0 facts (live, see contract §6.6):**

- **Auth works across both domain roots.** The pan-domain `gutoolsAuth-assym` cookie reaches services at both `*.local.dev-gutools.co.uk` and `*.test.dev-gutools.co.uk` because it's scoped at the parent `dev-gutools.co.uk` level. The original "this might break auth" concern is resolved — it doesn't.
- **`PLAY_SESSION` cookie is misleadingly scoped to `api.media.test.dev-gutools.co.uk`** (because `--use-TEST` sets `domainRoot=test.dev-gutools.co.uk`). This is cosmetic — `PLAY_SESSION` is not the auth cookie; the panda cookie is what matters.
- **HATEOAS root returns mixed-origin URLs.** Media-api itself responds at `api.media.local.dev-gutools.co.uk`, but cropper, metadata-editor, leases, collections, usage, loader, and imgops URLs in the same response point at `*.test.dev-gutools.co.uk`. Kupua's adapter must accept that one image response contains URLs at two domain roots — **never derive a base URI for sub-resources**, always use the per-link host. See contract §6.6 "Mixed-origin service URLs in `--use-TEST` mode" for full kupua-side implications.
- **CORS allowlist additions needed in two places** (vs Setup A's one): the local media-api S3 config bucket *and* each TEST satellite service config bucket (metadata-editor, cropper, leases, collections, usage). The Vite-proxy workaround (Phase 0 step 0.5) handles media-api but not the satellites — so for Setup B, **either** add multiple Vite proxy rules (one per Grid service host), **or** request real CORS allowlist updates across all the satellite configs.

---

#### Setup C — Kupua only, against TEST (current pre-integration setup)

**When to use:** You're not testing API-first integration. You're working on
existing direct-ES kupua features. This is what you've been doing.

**What runs:**
- Just `kupua/scripts/start.sh --use-TEST`
- No Grid Play apps. No media-api. No HATEOAS.

**Phase A onwards needs Grid running.** Setup C is fine for unrelated kupua
work but not for any phase in this plan.

---

### Will it "just work"?

**Mostly yes, with three things to verify in Phase 0:**

1. **Cross-origin cookie** (the big one). Does kahuna's auth cookie reach
   kupua at `kupua.media.local.dev-gutools.co.uk`? It *should* — Guardian's
   pan-domain auth is designed for this — but it's never been tested with
   kupua's hostname. Test by:
   - Logging into kahuna
   - Opening devtools at the kupua URL → Application → Cookies
   - Confirm `gutoolsAuth-assym` (or current cookie name) is visible

2. **CORS on media-api responses.** When kupua at `kupua.media.local...`
   fetches from `api.media.local...`, will media-api's CORS headers permit
   it? The cleanest workaround is the Vite proxy (no CORS needed,
   same-origin from browser's view) — see Phase 0 step 0.5.

3. **Domain root override side-effects in Setup B.** As above —
   `--use-TEST` changes how Grid thinks of its own URLs. This may or may
   not affect the auth cookie's `Domain` attribute.

If all three work as hoped, Setup A and Setup B both *just work* with no
further fiddling. If any one fails, you have a small, isolated problem to
solve before continuing — not a project-killer.

### Practical recommendations

- **Use Setup A first.** Get Phase 0 working with Grid's local Docker
  cluster. Smallest possible failure surface. Confirm auth and CORS work.
  Then move to Setup B for richer data.
- **Don't run both Setup A and Setup B at once.** Port 9200 collides
  (Grid's local Docker ES vs. SSH tunnel). Use one or the other.
- **Keep two terminals + one nginx running indefinitely.** Once
  configured, dev-nginx is a fire-and-forget background service. The two
  terminals (Grid, kupua) are what you start/stop daily.
- **Start Grid before kupua in Setup B.** Kupua's tunnel-detection logic
  reuses Grid's tunnel — but only if Grid set it up first. Reverse order
  works too (kupua opens the tunnel, Grid reuses) but is less obvious.
- **No script modifications needed for Setup B.** Both `start.sh` scripts
  already handle tunnel reuse correctly. Setup A *may* need a wrapper that
  exports `KUPUA_ES_URL=http://localhost:9200` and passes `--skip-es` —
  document this in worklog if you end up adding one.
- **In Setup B, the Vite proxy workaround needs multiple rules** (one per Grid service host — media-api, cropper, metadata-editor, leases, collections, usage), not just one for media-api. Setup A is single-origin so one rule suffices. See contract §6.6 for the full host list.
### What might need modification (don't pre-emptively change)

These are *possible* future changes to the start scripts. **Don't make
them yet** — only if Phase 0 surfaces a concrete need:

- **`kupua/scripts/start.sh`:** add a `--use-grid-local` flag that sets
  `KUPUA_ES_URL=http://localhost:9200` and `--skip-es` automatically.
  Convenience only.
- **`dev/script/start.sh`:** no changes anticipated. Grid doesn't need to
  know kupua exists.
- **`dev/nginx-mappings.yml.template`:** add the kupua mapping line
  (Phase 0 step 0.1). This is the **one** Grid file change required by
  the entire workplan.

---

## Using the kahuna UI inventory (applies to clusters and Phase C)

Every cluster (and Phase C) builds features that have a kahuna counterpart.
The kahuna image-detail UI is catalogued in
[kahuna-image-detail-inventory.md](../01%20Research/kahuna-image-detail-inventory.md)
(57 elements with file:line citations, permission matrix, conditional
render rules, joined-component seams). App-wide patterns — destructive
two-step confirms, semantic colour vocabulary, inline-edit affordance —
will be in `kahuna-app-wide-ui-constants.md` (pending).

**Rules for any agent implementing a kupua feature with a kahuna analogue:**

1. **Read the inventory row(s) for the feature.** Note the cited
   `.html` file:line. Open the file. Find the matching `.scss` in the
   same component folder. Do not infer kahuna's appearance from the
   inventory text alone — markdown descriptions of visuals are lossier
   than the source.
2. **Do NOT default to replicating kahuna's look.** Kahuna is constrained
   by AngularJS and 2015-era patterns (xeditable inline edits, hidden
   collapsibles, "Unknown (click ✎ to add)" placeholders, dropdown menus
   instead of multi-select chips). Past kupua work has produced *better*
   UX precisely because the agent didn't first see the kahuna version.
   For each element, **explicitly decide replicate-vs-improve with mk**
   before implementing — don't assume either default.
3. **DO replicate app-wide patterns exactly.** Users have muscle memory
   for: the two-step destructive-action confirm (and the
   `prompt("type DELETE")` escalation for nuclear actions); the semantic
   colour vocabulary (red=invalid, amber=warning, green=leased-override,
   etc.); the ✎ pencil for "edit this field". These cross every kahuna
   screen, so divergence in kupua is jarring. See the app-wide constants
   doc.
4. **When in doubt, ask mk.** Replicate-vs-improve is a UX call, not a
   technical one.

---

## Phase 0 — Dev-nginx, auth, service discovery

**Scope:** Make kupua reachable on a real `*.media.local.dev-gutools.co.uk`
hostname so it can ride Guardian's existing auth cookie. Confirm the
HATEOAS root endpoint returns links to all Grid services. Validate CORS.

**Time:** Half a day.

**Risk:** Trivial — config-only.

**Grid changes required:** One file: `dev/nginx-mappings.yml.template`. Add
a single mapping line.

### Concrete steps

#### 0.0 Unknowns pre-resolved by the Grid API contract audit

The following questions that were open when this workplan was written have been answered via live curl verification. See `grid-api-contract-audit-findings.md` §6.6 for the full details. No Phase 0 re-verification needed on these items:

| Question | Answer |
|---|---|
| Panda cookie name | `gutoolsAuth-assym` (asymmetric-key variant) |
| Kupua's origin in CORS allowlist? | **No** — 403 confirmed. Must add to both local media-api and TEST satellite configs. See §6.6 CORS workplan note. |
| `config.restrictDownload` in dev | Not restricted. `download` and `downloadOptimised` links both present. |
| mk's permissions | `showPaid: false`, `canUpload: true`, `canDelete: true`. Read from `GET /session` on auth service — **not** `GET /permissions` (that endpoint is a dead link; returns 404). |

#### 0.1 Add kupua to dev-nginx mappings

File: [dev/nginx-mappings.yml.template](dev/nginx-mappings.yml.template)

Add a mapping for kupua's dev port (3000):

```yaml
  - prefix: kupua.media
    port: 3000
```

Then, on the developer machine, run dev-nginx's `setup-app` against this
config. After that, `https://kupua.media.local.dev-gutools.co.uk` should
proxy to `http://localhost:3000`.

**Note:** This is the *one* Grid change in Phase 0. It's a config file, not
Scala. No Scala reviewer needed — any Grid contributor can review a single
YAML line.

#### 0.2 Configure Vite for the new hostname

In `kupua/vite.config.ts`, ensure dev server accepts requests proxied via
the dev-nginx hostname. Currently `host: true` is already set (binds to
0.0.0.0), so this should work. Verify by hitting the URL after step 0.1.

If Vite rejects the host, add it to `server.allowedHosts`:

```ts
server: {
  host: true,
  port: 3000,
  allowedHosts: [".local.dev-gutools.co.uk"],
  // ... existing config
}
```

#### 0.3 Test cookie auth

With kahuna logged in (`media.local.dev-gutools.co.uk` cookie set), open
`kupua.media.local.dev-gutools.co.uk`. Open devtools → Application →
Cookies. Confirm the `gutoolsAuth-assym` cookie is visible to kupua's origin.
(Cookie name confirmed via live verification — see step 0.0 / §6.6.)

If it isn't: the cookie is scoped too narrowly. Check the `Domain` attribute.
If it's `media.local.dev-gutools.co.uk`, it won't reach `kupua.media.local...`.
This is a kahuna/auth config issue — escalate to whoever maintains pan-domain
auth. (Likely it's already `.local.dev-gutools.co.uk` and works fine.)

#### 0.4 Fetch the HATEOAS root

From kupua, `fetch('https://api.media.local.dev-gutools.co.uk/', { credentials: 'include' })`.
Expect a JSON response with a `links` array. See contract §2 for the full root
links table (14 links, including `image`, `search`, `cropper`, `edits`, `collections`,
`leases`, `usage`, `session`, etc.). **No `actions` array at root level** (§8 correction 4).
All links are `Link` objects (`rel`, `href`); methods are not specified at root level.

#### 0.5 Validate CORS

This is the riskiest part of Phase 0. **Confirmed by live testing: kupua's origin is NOT in the allowlist** (§6.6, §8 correction 5). Both local media-api and TEST satellite services return 403 on preflight. Two resolution options:

- **Option A:** Make all media-api calls from kupua go through a Vite proxy
  rule (same-origin, no CORS needed). Simpler, no Grid changes.
- **Option B:** Add kupua's origin to media-api's `corsAllowedOrigins`
  config (§6.3). Requires adding to both the local media-api S3 config bucket and each TEST satellite service config. See §6.6 CORS workplan note for the exact list.

Recommendation: **start with option A**. Add a Vite proxy rule:

```ts
proxy: {
  "/api": {
    target: "https://api.media.local.dev-gutools.co.uk",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ""),
  },
}
```

Then kupua makes calls to `/api/images/{id}` — same-origin, cookie included
by Vite's proxy.

#### 0.6 Build a tiny "discovery" module

Create `kupua/src/dal/grid-api/service-discovery.ts`:

- Fetches the root once at startup
- Parses the `links` array into a typed map: `{ image, search, cropper,
  edits, collections, leases, usage, ... }`
- Exposes a `getServiceLink(name)` function used by all subsequent API
  adapter code
- Handles the case where a link is absent (user lacks permission) — returns
  undefined, callers feature-flag accordingly
- **Also captures `clientConfig`** from the same root response (or from the
  `configuration` link if media-api emits it separately). `clientConfig` is
  a server-deployed map of feature flags + UI copy strings (e.g.
  `enableWarningFlags`, `imagePreviewFlagAlertCopy`, `costFilterLabel`,
  `usePermissionsFilter`, `staffPhotographerOrganisation`,
  `showSendToPhotoSales`). Cluster 1 and every later cluster need to read
  it to gate features that are off in some deployments (e.g. BBC enables
  several flags Guardian does not, and vice versa). Expose via
  `getClientConfig(): ClientConfig` — a frozen object, fetched once,
  cached for the session. Treat *every* field as optional in the type;
  absence means "flag off" / "feature not configured".

This is the foundation of the API-first surface. It's the *only* config
kupua needs about Grid in production: one URL.

**Reference (7 May 2026):** the actual Guardian PROD `clientConfig` shape
is being captured via a logged-in `window._clientConfig` snapshot; Cluster 1
workplan will cite it directly so we only build features whose gates are
on in Guardian. BBC-only flags (e.g. `showSendToPhotoSales`) are noted as
render-gated seams — code paths exist but evaluate to off-by-default.

### Phase 0 deliverables

- [ ] kupua reachable at `kupua.media.local.dev-gutools.co.uk`
- [ ] Auth cookie verified
- [ ] Service discovery module fetches and parses `GET /`
- [ ] CORS resolved (via Vite proxy or media-api config)
- [ ] One screenshot of devtools showing the `links` array, saved to
      worklog as proof of concept
- [ ] Worklog entry summarising what worked, what surprised

### Phase 0 stop conditions

- If CORS requires media-api Scala changes that aren't trivially additive, **stop**
  and reconsider scope.
- If the auth cookie doesn't reach kupua's origin and the fix requires changes
  to pan-domain auth config, **stop** and ask. This isn't a kupua problem to
  solve.
- If the HATEOAS root response shape is dramatically different from what
  `integration-plan-api-first.md` assumes, **stop** and re-plan.

---

## Phase A — API adapter foundation (scaffolding, no user-visible features)

**Scope:** Build the `GridApiDataSource` skeleton, Argo `EmbeddedEntity`
unwrapping, error handling, the hybrid-adapter discipline, and a single
`getImageDetail(id)` method to prove the wiring. **No user-visible features
ship in Phase A.** The image detail view is not modified yet — the API call
is exercised from a test harness or a hidden devtools-only render.

**Time:** 2–3 days.

**Risk:** Low. Read-only, well-scoped, no UI surface area.

**Grid changes:** Zero. The endpoint exists today.

**Read-only is enforced, not just disciplined.** The `gridApiWriteGuard()`
Vite plugin (added in `5b7d8611e`) blocks every non-GET request on `/api`
(and any future satellite proxy prefix) unless `VITE_GRID_API_WRITES_ENABLED=true`.
The Vite proxy is the only path to media-api — direct cross-origin requests
are blocked by CORS. So all of Phase A and every read-only cluster operate
behind a hard guarantee that no write can leak. See
[`infra-safeguards.md`](../infra-safeguards.md) §8 for the full enforcement
model. **Future cluster handoffs that add a new proxy prefix
(e.g. `/grid-leases`) MUST add it to `GRID_API_PROXY_PREFIXES` in
`vite.config.ts` so the guard covers it too.**

**Why this is now scaffolding-only (changed 7 May 2026):** The original
Phase A wired `getImageDetail` into the live image detail view and rendered
"all the enriched fields the API returns". That collapsed the RO/RW boundary:
the image-detail view contains action-gated controls (delete, archive, edit
metadata, add lease, create crop) that depend on the `actions` array. The
audit (§3.3, §6.4) is explicit that `actions` absence means **hide** the
control, not disable it — so rendering the API response into the existing
detail view forces a choice between (a) hiding most of kahuna's affordances
silently, (b) implementing Phase C action handlers immediately, or (c)
rendering disabled stubs (anti-pattern). All three are bad.

The fix is to separate scaffolding from features. Phase A builds the
foundation that **every** subsequent cluster needs — service discovery,
adapter shape, Argo unwrapping, error handling, hybrid pattern. The first
user-visible feature ships as **Cluster 1** (cost + leases + validity, see
below). Future clusters layer on top of the same scaffolding.

**Why this is *Phase* A, not *Cluster 0*:** Clusters are user-visible
feature bundles. Scaffolding is foundational and underpins every cluster
equally. Naming it "Cluster 0" would imply it's a feature in the same
taxonomy; it isn't. It's the floor everything else stands on.

### Concrete steps

#### A.1 Define the API-side image type from the contract

Create `kupua/src/dal/grid-api/types.ts` from contract **§9** (`ImageResponse`,
`ImageData`, `EmbeddedEntity`, `UsageRights`, `Embedding`, `SyndicationRights`,
`FileMetadata`, etc.). Don't try to reuse the ES-derived `Image` type — the
shapes differ; translation happens at the adapter boundary.

The full response shape is in contract **§3**. Read §3.2 (field tables),
§3.2.1 (reconciliation rules for `metadata` / `usageRights` / `cost`), §3.3
(`actions`), §3.4 (`links`), §10 (annotated TEST samples) before writing
parsing code.

**Search-hit vs single-image asymmetry (matters for Cluster 1).** Search
hits and single-image responses are enriched identically (proven by
construction — both call `imageResponse.create()`, see
`enrichment-strategy.md` §A) **with one exception**: search hits include
`isPotentiallyGraphic` (a painless-script-computed boolean), single-image
responses do not. Phase A's types must reflect this:

- A shared base `ImageData` type with all enriched fields.
- `SearchHitImageData = ImageData & { isPotentiallyGraphic?: boolean }` (or
  equivalent — keep it optional, don't fake-default to `false`; absence
  means "unknown" semantically).

Without this, Cluster 1 will need to retype the world when it adds the
mirror-search method. Setting it up correctly in Phase A is ~5 lines of
type work; getting it wrong wastes a Cluster 1 day.

**Search-response envelope is asymmetric to single-image envelope, too.**
The search response carries a top-level `actions` MAP (currently containing
`tickerCounts` — a server-defined list of ticker badges with name, value,
backgroundColour, searchClause, optional subCounts). This is **not** the
same shape as the per-image `actions[]` array (HATEOAS action descriptors).
Different purpose, different shape, same field name — easy to confuse.
Phase A types must define both:

- `SearchResponse = { offset, length, total, hits: SearchHitImageData[],
  actions?: SearchResponseActions }`
- `SearchResponseActions = { tickerCounts?: TickerCount[] }` (extensible —
  the map may carry more in future).
- Per-image `actions[]` stays as it is (array of `Action` HATEOAS descriptors).

This is documented here so Cluster 1 doesn't trip on it when introducing
the mirror-search method. Same discipline as the `isPotentiallyGraphic`
asymmetry: ~5 lines of types in Phase A, no retyping in Cluster 1.

#### A.2 Build the Argo envelope helpers

Create `kupua/src/dal/grid-api/argo.ts`:

- `unwrapEntity<T>(response): T` — peels the `EmbeddedEntity` envelope per §6.1
- `findLink(entity, rel): Link | undefined`
- `findAction(entity, rel): Action | undefined`
- `mergeReconciledFields(image)` — applies §3.2.1 rules

These are pure functions. Test them against the §10 sample fixtures (copy
the JSON into a test fixtures directory — **redact any signed-URL query
strings before committing**).

#### A.3 Build the `GridApiDataSource` skeleton

Create `kupua/src/dal/grid-api/grid-api-adapter.ts`:

```ts
export class GridApiDataSource {
  constructor(private serviceDiscovery: ServiceDiscovery) {}

  async getImageDetail(id: string, signal?: AbortSignal): Promise<ImageDetail | null> {
    const url = this.serviceDiscovery.imageUrl(id);
    const response = await fetch(url, { credentials: "include", signal });
    if (response.status === 404) return null;          // image gone
    if (response.status === 401) throw new AuthError(); // re-auth needed
    if (response.status === 419) throw new SessionExpiredError();
    if (!response.ok) throw await parseArgoError(response); // §6.5
    return mergeReconciledFields(unwrapEntity(await response.json()));
  }
}
```

**Single method only in Phase A.** No `getCost`, no `getLeases`, no
`followLink` helper. Those land in Cluster 1 with a real consumer.

This adapter is **separate** from the ES adapter. They don't share code,
they don't implement the same interface. Each consumer chooses which to call.

#### A.4 Wire error handling end-to-end

Cover the four error classes from contract §6.5: `401` (re-auth toast),
`419` (session-expired toast distinct from 401), `403` (silent — caller
treats as data-absence per kupua's "graceful API absence" directive), and
Argo error bodies (`{ errorKey, errorMessage }`). Add a `parseArgoError`
helper.

Per the kupua directive on graceful API absence: API failure → caller
receives `null` → UI renders without that data section. **No error toasts
in normal operation** for absent data. Toasts are reserved for re-auth /
session-expired flows that genuinely require user action.

**Distinguish guard 403 from server 403.** A 403 from the Vite proxy guard
(`gridApiWriteGuard()`) has a plain-text body starting with
`[grid-api-write-guard]`; a 403 from media-api is Argo JSON
(`{ errorKey, errorMessage }`). The first is a developer-config issue
(env var unset), the second is a real permission gap. `parseArgoError`
should detect non-JSON bodies prefixed with `[grid-api-write-guard]` and
throw a distinct `WriteGuardBlockedError` with a clear message pointing
at `infra-safeguards.md` §8 — not silently fold it into the
data-absence path. This will only fire in Phase C-style sessions, but the
detection belongs in the foundation so every adapter call site benefits.

#### A.5 Document the hybrid-adapter rule in code

Drop a `kupua/src/dal/grid-api/README.md` (≤30 lines) that says:

- This adapter is for media-api/HATEOAS calls only.
- The ES adapter handles all search-shape data flows.
- Decision matrix lives in `integration-workplan-bread-and-butter.md`
  ("Architectural rule: where each call goes" §).
- Enrichment mechanism is mirror-search per buffer-fill, decided in
  `kupua/exploration/docs/00 Architecture and philosophy/enrichment-strategy.md`.
  Cite that doc as the canonical reference for *why* per-id is not the
  default.
- **Merge direction: ES baseline → API overwrite, never the inverse.**
  ES-sourced fields are the standalone-mode floor (kupua works without
  Grid). API enrichment overwrites server-computed fields when reachable.
  This is permanent, not scaffolding-to-rip-out. Same pattern applies
  to vendored config under `src/lib/cost/` (added by Cluster 1) and to
  any future small server-computed fields (`isPotentiallyGraphic`, etc.).
- Never construct media-api URLs by string concatenation — always follow
  links / templates from service discovery or HATEOAS responses.
- Never replicate server-side logic that has no ES-derivable fallback
  (permissions, validity reasons computed from leases) — fetch it. The
  exception is fields with a clean ES-derivable subset where the API
  value is strictly more accurate (cost: TS computes Free/Conditional/
  Pay, API overwrites with overquota when present).

#### A.6 Test harness — prove the wiring without touching the UI

Add a Vitest suite `grid-api-adapter.test.ts`:
- Mocks `fetch`; asserts URL construction from service discovery.
- Asserts envelope unwrapping against §10 fixtures — **both shapes**:
  single-image (`EntityResponse<ImageData>`) AND a search hit
  (`EmbeddedEntity<ImageData>` inside `EntityResponse<EmbeddedEntity<ImageData>[]>`).
  The nesting differs; if Phase A only fixtures single-image, Cluster 1
  discovers mid-implementation that the search-hit shape doesn't unwrap
  cleanly. Catching this in Phase A is ~10 lines of fixture work.
- Asserts error-class mapping for 401/403/404/419/Argo-error bodies AND
  for the guard 403 (`[grid-api-write-guard]` plain-text body →
  `WriteGuardBlockedError`).
- Asserts `null` return for 403/404 server cases (data-absence path).
- Asserts the type-level invariant that `isPotentiallyGraphic` is optional
  on the search-hit type and absent from the single-image type (TS
  type-test, no runtime assertion needed).

Optionally add a hidden devtools-only fetcher (`window.__kupua_grid_api__ =
{ getImageDetail }`) so manual TEST-cluster smoke tests are possible without
a UI. Remove or gate behind `import.meta.env.DEV` before merging anywhere
near production.

### Phase A deliverables

- [ ] `GridApiDataSource` class with `getImageDetail(id)`
- [ ] Argo envelope helpers (`unwrapEntity`, `findLink`, `findAction`,
      `mergeReconciledFields`)
- [ ] Error-class hierarchy (`AuthError`, `SessionExpiredError`, `ArgoError`)
- [ ] Vitest suite green against §10 fixtures
- [ ] `kupua/src/dal/grid-api/README.md` documenting the rule
- [ ] `deviations.md` entry: "two parallel data adapters intentionally —
      see integration-workplan-bread-and-butter.md"
- [ ] AGENTS.md updated: Component Summary row for `dal/grid-api/`,
      Context Routing row pointing at this workplan + the contract audit
- [ ] **No** changes to the image detail view, search results, or any
      user-visible component
- [ ] **No** new HATEOAS link fetching, no cost rendering, no badges —
      those are Cluster 1

### Phase A explicit non-goals

- No `getLeases` / `getUsages` / `getCrops` adapter methods. Cluster-specific.
- No `followLink` helper. Cluster 1 introduces it when there's a real call site.
- No image-detail-view changes. Cluster 1 wires the first one.
- No bulk fetch helper yet. The enrichment mechanism is decided
  (`enrichment-strategy.md`: mirror-search per buffer-fill); the helper
  itself lands in Cluster 1 with a real call site.
- **No mirror-search method, no enrichment merge layer, no `useEnrichment`
  hook.** The seam where API data overwrites the ES baseline is Cluster 1's
  job. Designing it without a consumer means guessing the caching strategy,
  visibility-gating, and per-field merge semantics — history says agents
  get at least one wrong. Phase A keeps the foundation enrichment-ready
  (shared base type, both envelope nestings handled, overwrite-direction
  rule documented) but does not build the layer itself. Same discipline
  as deferring `followLink` and per-resource adapters.
- No vendored cost config under `src/lib/cost/`. Cluster 1 adds it with
  the cost computation that consumes it. Phase A's README acknowledges
  the seam ("Cluster 1 will add a vendored config snapshot") but commits
  no JSON.

### Phase A stop conditions

- If Argo envelope unwrapping reveals an edge case not covered by §6.1,
  **stop** and update the contract audit before proceeding.
- If `getImageDetail` against TEST returns shapes that contradict §3 / §10,
  **stop** and reconcile (could indicate audit drift or env-specific config).
- If error-class mapping turns out to be ambiguous (e.g. media-api returns
  401 where 419 is expected, or vice versa), **stop** and document.

---

## After Phase A — cluster decomposition

Phase A ships zero user-visible features. The first one is **Cluster 1**
below. Future clusters are deliberately *not* pre-committed in this
workplan — order is decided after Cluster 1 ships, based on what we've
learned about the hybrid pattern's costs and quirks.

### Cluster 1 — Cost + leases (+ validity)

**One-line pitch:** Show cost-state badges (free / pay / no-rights /
overquota / conditional) on every visible image — in image detail and as
badges on search-result cells. Pure read-only. Validates the hybrid
pattern (ES search + per-cell API enrichment) end-to-end.

**Why first:**
- Cost is server-computed (`CostCalculator` in Scala). It cannot be
  replicated client-side without lying about edge cases (lease overrides,
  the `valid==true` + non-empty `invalidReasons` case from §6.7.1). This
  is *exactly* what API-first is for.
- Badges-on-search-cells is the unison case. Every future cluster also
  needs to enrich already-rendered ES cells with API data. If this works,
  the rest is variations on the theme. If it doesn't, we find out before
  building five things on the same foundation.
- Demonstrable to anyone in one sentence: "kupua now shows you which
  images cost money."

**Scope:**
- Cost-state badges in image detail (replaces nothing today; pure addition).
- Cost-state badges on grid cells and table rows (lazy; visibility-gated).
- Lease summary in image detail (count line: "3 current leases + 2 inactive").
- Validity badge in image detail + bearing on No-Rights colour/messaging
  (small addition, related data, kept in scope to avoid an awkward
  Cluster 1.5 for one badge).

**Out of scope for Cluster 1:**
- Lease *list* in image detail (defer to cluster covering full lease history).
- Lease editing (Phase C).
- **Photo-sales icon (inventory row 15).** The `hasSyndicationUsages` half
  is derivable from search-hit data, BUT the icon is gated by
  `showSendToPhotoSales` clientConfig flag = `false` in both Guardian PROD
  and TEST, AND the `showPaid` permission. Don't build the render path.
  When/if a deployment turns the flag on, a future cluster wires it up.
- **`gr-image-usage` panel (single-image usages list).** Out of scope here
  to keep Cluster 1 small — own future cluster ("usages display") covers
  the full per-image list with timestamps, references, etc. Per-cell
  print/digital BADGES (rows 13–14) ARE in scope because they're free
  from search-hit data (corrected 7 May 2026; see below).
- **All UI gated by `enableWarningFlags` (inventory rows 7–10: alert /
  warning / lease-attached selection overlays).** Verified off in both
  Guardian PROD and TEST `clientConfig` snapshots (7 May 2026), with
  `imagePreviewFlag*Copy` = `"Not configured"`. Dead code in the Guardian
  deployment. Cluster 1 does not build the overlay UI. Phase A's
  `getClientConfig()` exposes `enableWarningFlags` so a future cluster (or
  a different deployment) can turn it on, but the render path is not built.
- **Photo-sales icon (inventory row 15).** Gated by `showSendToPhotoSales`,
  off in both Guardian PROD and TEST. Not built.
- **Permissions-filter mode (`usePermissionsFilter`).** Off in both Guardian
  PROD and TEST. Cluster 1 implements the standard cost filter only.

**Guardian-config scope pruning (7 May 2026):** Captured Guardian PROD and
TEST `clientConfig` via logged-in `window._clientConfig` (raw snapshots
stored locally, not committed; key flag values inlined here). Several
Kahuna features the inventory documents are **dead in the Guardian
deployment** — their gate flags are `false` on both PROD and TEST. Cluster 1
builds none of them; they're listed in "Out of scope" above. Phase A's
clientConfig capture means a future deployment that flips a flag can
light up the corresponding UI without code changes (when we eventually
build it). BBC's flags are out of scope: noted, not built.

**Bulk-fetch decision — RESOLVED (7 May 2026):** See
`kupua/exploration/docs/00 Architecture and philosophy/enrichment-strategy.md`.
Kupua stays direct-ES for scroll/pagination and uses **mirror-search per
buffer-fill** (`GET /images?q=…&length=N&orderBy=…`) for enrichment —
search hits carry the same `cost` / `valid` / `invalidReasons` /
`persisted` / `actions` / `links` payload as `GET /images/{id}` (proven
by construction + TEST-verified). `?ids=` is reserved for the one
genuine consumer: non-contiguous persistent selection reconciliation.
Wholesale-mirror is impractical (9 hard capability gaps in media-api vs
kupua's pagination architecture). Cluster 1 implements this pattern.

### Inventory rows in scope for Cluster 1

Source: `kupua/exploration/docs/01 Research/kahuna-search-results-cost-signals.md`
(grid cells) and `kupua/exploration/docs/01 Research/kahuna-image-detail-inventory.md`
(detail panel). Replicate-vs-improve decisions made here so the implementer
doesn't punt:

| Row | Signal | Surface | Decision |
|---|---|---|---|
| 1–4 | Cost badge: free / pay / conditional / overquota | Grid cell + table row | Replicate Kahuna semantic colours 1:1 (user pref). Bottom-left thumb overlay. |
| 5 | Graphic image blur | Grid cell | Replicate Kahuna (blur + click-to-reveal). Gated on `isPotentiallyGraphic` (search hit only) + hardcoded `defaultShouldBlurGraphicImages=true`. |
| 6 | Staff-photographer border | Grid cell | Replicate. Gated on `usageRights.category === "staff-photographer"`. |
| 11 | Syndication icon | Grid cell | Replicate. Read from enrichment payload. |
| 12 | Archiver status icon | Grid cell | Replicate. Read from enrichment `persisted` reasons. |
| 13 | Print usages icon | Grid cell | Replicate. Derived from `usages[]` (embedded inline on search hit per `ImageResponse.scala:369,372`). `local_library` icon, `icon-warning` red if any usage with `platform="print"` and `dateAdded` within last 7 days. **No additional network call.** |
| 14 | Digital usages icon | Grid cell | Replicate. Same as row 13 with `platform="digital"`, `phonelink` icon. |
| 16 | Cost text pill | Single-detail metadata | Replicate. |
| 17 | Validity link | Single-detail metadata | Replicate as link, opens disclosure of `invalidReasons` map (no editing). |
| 18 | Lease cards | Single-detail metadata | **Improve:** count-only summary for Cluster 1 ("3 current, 2 inactive"); full list + gradient pills deferred to leases-history cluster. Lease percentage gradient is a Kahuna idiom worth questioning. |
| 19 | Cost summary pills | Multi-detail metadata | Replicate 1:1 incl. leased-fraction gradient on `pay`/`overquota`/`conditional` pills. Teal-to-{red\|orange} `linear-gradient(90deg, ...)` showing the % of the bucket with active `allow-use` lease (rescues paid → usable). See Cluster1.11 for predicate + colour spec. |
| 20 | "Free to use only" filter | Toolbar | **Already exists** — `kupua/src/components/SearchFilters.tsx:55-66`. No work. |

### `clientConfig` source (hardcode-defaults rule)

Phase A's `service-discovery.ts:getClientConfig()` returns `undefined`
(stubbed; `_clientConfig` is a kahuna-template concept, not in media-api
root). Cluster 1 does NOT wire it. Hardcode Guardian PROD defaults at every
consumer site, marked with a TODO so a future agent picks them up when
`GET /config` lands (see `integration-plan-api-first.md` Phase 1):

```ts
// TODO: clientConfig source — see integration-plan-api-first.md Phase 1
const enableWarningFlags = false;            // PROD + TEST
const showSendToPhotoSales = false;          // PROD + TEST
const usePermissionsFilter = false;          // PROD + TEST
const defaultShouldBlurGraphicImages = true; // PROD + TEST
const staffPhotographerOrganisation = "GNM"; // PROD + TEST
const costFilterLabel = "Free to use only";
```

Why hardcode rather than wire to kahuna: creates a kahuna-template
dependency we'd then rip out. eelpie's "frontend should know one URL"
argument applies. Hardcoded defaults are honest and revisitable in one
grep when the endpoint exists.

### Concrete steps

#### Cluster1.1 — Vendor `GuardianUsageRightsConfig` snapshot

Create `kupua/src/lib/cost/guardian-config.json` and
`kupua/src/lib/cost/types.ts`. Sources (read-only, snapshot once, ageing
slowly):

- `freeSuppliers` (11 entries) →
  `common-lib/src/main/scala/com/gu/mediaservice/lib/guardian/GuardianUsageRightsConfig.scala:638`
- `suppliersCollectionExcl` (Getty → payGettySourceList) →
  `GuardianUsageRightsConfig.scala:651`
- `payGettySourceList` (~418 entries, contains dupes) →
  `GuardianUsageRightsConfig.scala:144`. Dedupe on snapshot.
- UsageRights category → `defaultCost` map (e.g. `staff-photographer→free`,
  `chargeable→pay`, `pr-image→conditional`, `agency→null`, `handout→free`)
  derived from
  `common-lib/src/main/scala/com/gu/mediaservice/model/UsageRights.scala`

These are the standalone-mode (no-Grid) baseline. Permanent, not
scaffolding (per `enrichment-strategy.md` §C). Add a header comment in
the JSON noting source paths + snapshot date so a future agent knows
where to refresh from.

#### Cluster1.2 — Port `CostCalculator` to TS

`kupua/src/lib/cost/calculate-cost.ts`. Pure function:

```ts
calculateCost(usageRights: UsageRights, config: GuardianCostConfig): Cost | null
```

Mirror Scala priority chain
(`media-api/app/lib/usagerights/CostCalculator.scala:39-50`):
`restrictions ? Conditional : categoryCost ?? supplierCost ?? defaultCost`.
`supplierCost` = Agency-only check via `freeSuppliers` ∩
`suppliersCollectionExcl`. **Overquota returns `null`** (live S3 state,
API-only — let API enrichment overwrite). ~50 lines + Vitest covering
each branch.

#### Cluster1.3 — Port `validityMap` to TS

`kupua/src/lib/cost/validity-map.ts` from
`media-api/app/lib/ImageExtras.scala:50`. Mechanical port. Inputs:
`usageRights`, `metadata.credit`, `metadata.description`, `leases`. Output:
`Record<reasonKey, boolean>`. Vitest unit tests.

#### Cluster1.4 — Mirror-search method on `GridApiDataSource`

Add `searchByQuery(q, length, orderBy, offset?, signal?)` to
`kupua/src/dal/grid-api/grid-api-adapter.ts`. `GET /api/images?q=…&length=…&orderBy=…&offset=…`.
Returns the `SearchResponse` envelope already typed in Phase A.1.
Graceful absence: network/timeout/non-2xx → `null` (per AGENTS directive,
ES baseline still renders). Same error-class mapping as `getImageDetail`
for auth/guard/Argo cases. Vitest with fixtures (use the search-hit
fixture set added in Phase A.6).

**Deep-scroll enrichment is out of scope for Cluster 1.** With `offset`
support, enrichment covers buffer windows up to `offset+length ≤ 10_000`
(media-api inherits ES `index.max_result_window`). Past that, ES baseline
renders without enrichment overwrite — no errors, just absence. Add a
one-line entry to `deviations.md` documenting the cap.

A separate research session **before any cluster that makes deep-scroll
enrichment user-visible** must compare candidate strategies against
(a) all three scroll modes (in-memory <1k, two-tier 1k-65k, seek >65k),
(b) all sort fields (not just date), (c) URL/body size limits at
`page_size=200`, (d) cancellation/staleness semantics, (e) what (if
anything) media-api would need to add. Candidates identified so far:

  1. `offset` paginated mirror-search (this cluster's choice; dies past 10k).
  2. `GET /api/images?ids=…` chunked — exact window, but 200 ids ≈ 7kB URL,
     CloudFront/ALB header limits a real risk.
  3. Ranged sort-cursor mirror (e.g. `since`/`until` for `uploadTime`,
     equivalents for other fields) — works past 10k for date sorts;
     tie-handling and non-date sorts unsolved.
  4. New POST/mget endpoint on media-api — cleanest, but scope creep into
     media-api territory we've otherwise avoided.

Decision blocked on that research; do NOT attempt it inside Cluster 1.

#### Cluster1.5 — `useEnrichment` hook

New `kupua/src/hooks/useEnrichment.ts`. Per-buffer-fill mirror-search
keyed off the active query/orderBy/cursor span. Returns
`Map<imageId, EnrichmentFields>` where `EnrichmentFields` =
`{ cost, valid, invalidReasons, persisted, usageRights, leasesSummary, actions, isPotentiallyGraphic }`.
Discards mirror-search response shape; exposes only the fields cluster
needs. Cancellation tied to the buffer's `AbortController`. Re-runs when
the buffer cursor span changes, NOT per-cell.

#### Cluster1.6 — Enrichment merge in store

Wire `useEnrichment` into search-store (or co-located selector) such
that visible cells expose enriched fields. **Merge direction: ES baseline
→ API overwrite** (per `enrichment-strategy.md`, §C). ES baseline:
`calculateCost(image.usageRights, guardianConfig)` + `validityMap(image)`
computed locally. API result overwrites field-by-field on arrival,
including `cost = "overquota"`. No flicker mitigation needed for v1
(baseline is computed instantly; API arrives 50–200ms later — visible
state goes from "computed-best-effort" to "authoritative", same colour
99% of the time).

#### Cluster1.7 — Badge primitives + Tailwind colour tokens

Author `Badge` in `kupua/src/components/metadata-primitives.tsx`.
Variants: `free` (green), `pay` (red), `conditional` (amber), `overquota`
(purple), `no-rights` (red). Extend `tailwind.config.ts` with semantic
tokens (`grid-cost-free`, `grid-cost-pay`, `grid-cost-conditional`,
`grid-warning`, `grid-danger`) — Kahuna semantic colours sampled from the
existing UI (replicate near 1:1 per user pref). Vitest snapshot per variant.

#### Cluster1.8 — Grid cell overlays

Mount in `kupua/src/components/ImageGrid.tsx:187-200` thumbnail container:

- Cost `Badge` bottom-left (rows 1–4).
- `GraphicWarningOverlay` blur + click-to-reveal (row 5). Gate on
  `isPotentiallyGraphic && defaultShouldBlurGraphicImages`.
- Staff-photographer border (row 6). Gate on
  `usageRights.category === "staff-photographer"`.
- Syndication icon (row 11). From enrichment.
- Archiver status icon (row 12). From `persisted` reasons.
- Print usages icon (row 13). From `usages[]` filtered to `platform==="print"`.
  `local_library` icon, `icon-warning` red if any usage has `dateAdded`
  within last 7 days.
- Digital usages icon (row 14). Same as row 13 for `platform==="digital"`,
  `phonelink` icon.

Playwright spec covering visible cells light up after the buffer-fill
mirror-search resolves.

#### Cluster1.9 — Table row column

Add a `cost` entry to `kupua/src/lib/field-registry.ts` with a
`cellRenderer` that reuses the `Badge` primitive. No new component.

#### Cluster1.10 — Single-image detail "Rights" section

In `kupua/src/components/ImageMetadata.tsx:70-90`, add a `MetadataSection`
named "Rights" containing:

- Cost text pill (row 16) — same `Badge` primitive, larger size variant.
- Validity link (row 17) — opens disclosure of `invalidReasons` map.
- `LeaseCard` count-only summary (row 18) — new component, just
  `"{n} current · {m} inactive"`. Full list + gradient pills deferred to
  the leases-history cluster.

#### Cluster1.11 — Multi-detail cost summary (with leased-fraction gradient)

In `kupua/src/components/MultiImageMetadata.tsx`, add a top "Cost summary"
section: aggregate counts across selection (row 19). Reuses `Badge`
primitive at small size for `free` / `no_rights` (no gradient).

For `pay`, `overquota`, and `conditional` pills, replicate Kahuna's
leased-fraction gradient 1:1 (`gr-info-panel.js:61-68`):

```ts
// Predicate: image is in this cost bucket AND has an active allow-use lease
const isLeased = (img) =>
  img.cost === bucket.cost &&
  img.leases?.leases?.some(l => l.access === "allow-use" && l.active);

const pct = Math.floor(100 * leasedCount / bucket.count);
const altColor = bucket.cost === "conditional" ? "orange" : "red";
const style = { backgroundImage:
  `linear-gradient(90deg, teal 0 ${pct}%, ${altColor} ${pct}% 100%)` };
```

Semantics: the teal-to-{red|orange} split shows what fraction of paid /
overquota / restricted images in the selection have an **active
`allow-use` lease** that lifts the paid blocker (rescues them to usable).
Lease access values in Grid are `allow-use`, `allow-syndication`,
`deny-use`, `deny-syndication` — only `allow-use` triggers the rescue.
Cropping/syndication permissions are independent and don't feed this
gradient. **Replicate exact colours** (`teal` / `red` / `orange` literal
keywords as Kahuna does) — these are muscle-memory for editorial users.

`free` and `no_rights` pills get no gradient: free has no upgrade path,
no_rights has no rescue mechanism.

#### Cluster1.12 — Test surface

- **Vitest unit:** `calculate-cost`, `validity-map`, `Badge` snapshots,
  `searchByQuery` adapter (mock fetch with §10 search-hit fixtures).
- **Vitest hook:** `useEnrichment` with mocked `GridApiDataSource` —
  assert API overwrites ES baseline; assert cancellation on
  buffer-cursor change.
- **Playwright e2e (against TEST):** load grid, verify cost badges
  populate on visible cells after a moment. Open image detail, verify
  cost pill + lease summary + validity link render.
- **Playwright graceful absence:** stub `/api/images` proxy to 503;
  verify ES baseline still renders (cost computed locally), no toast,
  no console error in normal operation.

Run mandatory surfaces per AGENTS table:
`npm --prefix kupua test` then `npm --prefix kupua run test:e2e`.
Warn user about port :3000 before Playwright.

#### Cluster1.13 — Anti-goals (do NOT build in this cluster)

- Lease editing (Phase C).
- Lease full list / gradient pills (deferred cluster).
- Per-cell photo-sales icon (row 15) — gated off by `showSendToPhotoSales`
  in PROD + TEST. Data is free (in `usages[]`), render path not built.
- Warning-flag overlays (rows 7–10) — gated off in Guardian PROD + TEST.
- Photo-sales icon (row 15) — gated off.
- Permissions-filter mode — gated off.
- `gr-image-usage` panel in image detail — single-image usage fetch,
  separate cluster.
- `clientConfig` wiring — defer to API-first plan Phase 1
  (`GET /config`), use TODO-marked hardcoded defaults.

### Future cluster candidates (NOT pre-committed)

Listed for awareness; ordering decided after Cluster 1:

- Validity-only (if Cluster 1 absorbs it as planned, this disappears).
- Usages display ("where has this image been used").
- Crops history (read-only list).
- Edits / labels / archived-state history (display only — editing is Phase C).
- Collections membership display (per-image; tree browser is its own thing).
- Syndication rights display (small if RCS link present).

Persistence reasons, permissions reflection, and `actions`-driven
hide/show are cross-cutting concerns handled in Phase A scaffolding, not
their own clusters.

### Handoff backlog (do these AFTER Phase A, in order)

1. ~~**Bulk-fetch feasibility study**~~ — **DONE (7 May 2026).** See
   `kupua/exploration/docs/00 Architecture and philosophy/enrichment-strategy.md`.
   Strategic answer: stay direct-ES + enrich via mirror-search
   side-channel. No new media-api endpoints required.
2. ~~**Cluster 1 detailed workplan**~~ — **DONE (7 May 2026).** Inlined
   above as Cluster1.1–Cluster1.13 with replicate-vs-improve decisions
   made, mount points cited, vendored config sources cited. Cost-split
   decided (7 May 2026): TS computation for Free/Conditional/Pay using a
   vendored `GuardianUsageRightsConfig` snapshot, kept permanently as the
   standalone-mode (no-Grid) baseline; API enrichment overwrites when
   reachable, including overquota state. Production-ready kupua will
   fetch quotas on boot (rare-changing JSON, ~5 agencies). See
   `enrichment-strategy.md` §C "Cost computation".
3. **Cluster 2 selection** — Decided after Cluster 1 ships. Don't
   pre-write.

---

**Note (7 May 2026):** Phase B is preserved here as the original framing
(read-only HATEOAS panels in image detail). It is **superseded in practice
by the cluster decomposition** that begins after Phase A. Each Phase B
feature listed below maps to a future cluster (usages, leases history,
crops history, edits history, collections membership). Don't implement
Phase B as a single phase — implement individual clusters with their own
workplans. The table below is now a backlog index, not a sequenced plan.

## Phase B — Read operations through HATEOAS

**Scope:** Implement read-only bread-and-butter features by following the
HATEOAS links in the image-detail response. Specifically: usages, leases,
crops, collection membership, edits history.

**Time:** 1–2 weeks.

**Risk:** Low–medium. Each feature is small and self-contained. The
discipline of "follow links, don't construct URLs" is new.

**Grid changes:** Zero.

### What to build

For each of the following, the pattern is identical:

1. Image detail response includes a `links` entry pointing to the resource
2. kupua follows the link, parses the response, displays it

| Feature | Link to follow | Service | Contract ref |
|---|---|---|---|
| Image usages | `usages` link | usage | §4.1 |
| Lease history | `leases` link | leases | §4.2 |
| Crop history | `crops` link | cropper | §4.3 |
| Edit history (labels, archived state) | `edits` link | metadata-editor | §4.4 |
| Collection membership | `collections` link | collections (already in image response) | §4.5 |
| Collection tree | `collections` link in HATEOAS root | collections | §4.6 |

### Concrete steps

#### B.1 Build a `followLink(name, image)` helper

Centralise the "find the link in this entity, fetch it, return parsed JSON"
operation. Errors when link is absent (means user lacks permission or
resource doesn't exist for this image) → return null, UI hides the section.

#### B.2 Pick the lowest-effort feature first

**Suggestion: usages.** It's read-only, displays a list, requires no editing
UI. Build the panel in image detail. Validate that the pattern works.

#### B.3 Iterate on each remaining feature

In order of UX value: leases (because they appear on more images), then
crops, then edits history. Each is 1–2 days of kupua work.

#### B.4 Browse collection tree

Slightly different — uses the `collections` link from the *root* response,
not the image response. Recursive tree fetch. Probably a separate
`CollectionsBrowser` component. Read-only initially (no add/remove).

### Phase B deliverables

- [ ] Usages panel in image detail (API-driven)
- [ ] Leases panel in image detail
- [ ] Crops panel
- [ ] Edits/labels display
- [ ] Collection tree browser (read-only)
- [ ] All Phase B features feature-flagged off if HATEOAS link absent

---

## Phase C — Write operations through HATEOAS actions

**Scope:** Implement metadata editing, label management, leasing, cropping,
archiving, deletion. All via the `actions` array in the image-detail
response.

**Time:** 2–4 weeks.

**Risk:** Medium. First time kupua writes to anything. Need user
confirmation flows, error handling, optimistic UI.

**Grid changes:** Zero. All write endpoints exist today and serve kahuna.

### Critical safety constraints

- **Writes only against TEST initially.** No PROD writes from kupua until a
  human review process exists.
- **Unlocking writes is a single env var flip:** Phase C runs with
  `VITE_GRID_API_WRITES_ENABLED=true` so the `gridApiWriteGuard()` plugin
  (`vite.config.ts`, see [`infra-safeguards.md`](../infra-safeguards.md) §8)
  stops blocking non-GET methods. Until that flag is set, writes are
  physically impossible from browser code — the proxy returns 403 before
  the request reaches media-api. Treat the env var as a deliberate per-session
  opt-in, never a default.
- **Permission gating from the API.** If `actions.edit` is absent in the
  image response, kupua hides the edit UI. Don't replicate permission logic
  in TypeScript — trust the API.
- **Optimistic updates with rollback.** ES eventual consistency means edits
  take 1–10s to reflect in search results. Show optimistic UI, refetch the
  detail after a delay to confirm.

### Order of features

1. **Add/remove labels** (simplest write, low blast radius) — §5.1 (no permission gate, `auth.async` only)
2. **Archive / unarchive** (boolean toggle) — §5.2 (`ArchiveImages` always true = no gate)
3. **Edit metadata fields** (free-text, more complex form) — §5.3 (requires `EditMetadata` or be uploader)
4. **Add/remove lease** (date pickers, lease type dropdown) — §5.5/5.6/5.7/5.9 (no permission gate)
   - **Important:** `POST /leases` body is a **bare `MediaLease` JSON** — not wrapped in `{data:...}` (§8 correction 7, §5.5)
   - **Important:** `PUT /leases/media/{id}` (replace-all) is fire-and-forget at the DynamoDB level — read back to confirm (§5.16, §8 item 10)
5. **Create crop** (most complex — UI for crop rectangle, format selection) — §5.10
   - **Important:** `POST /crops` response is a **bare `Crop` JSON**, NOT wrapped in `EntityResponse` (§8 correction 2, §5.10.3)
   - **Important:** crop creation is `POST /crops` on the cropper base URI, not on the per-image crops URL (§8 correction 1, §5.10.1)
6. **Delete image** (most dangerous — confirmation flow) — §5.11
   - **Important:** `DELETE /images/{id}` is fire-and-forget at the DynamoDB level (§8 item 12). Read back to confirm.
   - Condition: presence of `delete` action in the response (not `persisted.value` — these are independent; see §6.7.2)
7. **Add to / remove from collection** (collection picker) — §5.12/5.13
8. **Syndication actions** (low priority) — §5.14 (usage recording is fire-and-forget inside handler)

### Out of scope for Phase C

- **Upload.** Defer to a Phase D. Upload involves multipart form posts to
  image-loader, signed S3 presigned URLs, polling for processing status.
  Worth its own plan.
- **Hard delete.** Don't implement until soft delete + undelete are battle-tested.

---

## Architectural rule: where each call goes

This is the rule the codebase must enforce, and that AGENTS.md must capture
so fresh agents follow it without re-deriving it:

| Operation | Adapter | Why |
|---|---|---|
| **Search** (with filters, pagination) | ES adapter | Already built, fast, kupua-specific shape |
| **search_after / PIT** (windowed buffer) | ES adapter | Same |
| **Aggregations** (facet filters) | ES adapter | Same |
| **Sort distributions** (scrubber) | ES adapter | Same |
| **Position maps, percentile, countBefore** | ES adapter | Same |
| **Image detail** | API adapter | Cost/validity/signed URLs/actions |
| **Usages, leases, crops, edits** | API adapter (HATEOAS) | Server-side permission gating |
| **Metadata edit** | API adapter (HATEOAS action) | Use kahuna's logic, don't replicate |
| **Crops, leases, collections, archive** | API adapter (HATEOAS action) | Same |
| **Upload, delete** | API adapter | Same |
| **Auth, permissions** | Inferred from API responses | Don't replicate; trust the server |

The full permissions catalogue is in contract §6.4. Error response shapes are in §6.5. Always handle `401` (re-auth), `419` (expired cookie, distinct from 401), `403` (authorised but not permitted), and Argo error responses (`{ errorKey, errorMessage }`). See §6.5 for the full `errorKey` list.

**Note on the proxy guard:** non-GET responses with 403 may also originate from `gridApiWriteGuard()` itself (when `VITE_GRID_API_WRITES_ENABLED` is unset) rather than from media-api. The body is plain text starting with `[grid-api-write-guard]` — distinguishable from Argo `{ errorKey, errorMessage }` JSON. Adapter error handling should detect this and surface a clear developer-facing message rather than treating it as a permission denial. See [`infra-safeguards.md`](../infra-safeguards.md) §8.

**For each API call in Phase B or C, read the corresponding contract §4 or §5 subsection before writing adapter code.**

> **Directive: read the contract before coding.** Before writing any adapter code for a Phase B or C feature, read the corresponding section of `grid-api-contract-audit-findings.md`. Key cross-cutting sections: §6.1 (Argo/EmbeddedEntity rules), §6.4 (permissions), §6.5 (error keys), §5.16 (async consistency table). Quick checklist: does the response body need unwrapping? What permission gates apply? Is the endpoint fire-and-forget (check §5.16)? Is the request body wrapped in `{data:...}` or bare?

Sessions on this workplan need explicit constraints. Add to AGENTS.md:

> **Directive: bread-and-butter integration scope.** This workplan permits
> the agent to:
> - Modify any file under `kupua/`
> - Modify `dev/nginx-mappings.yml.template` (one mapping line, Phase 0
>   only) **with explicit user approval per session**
>
> The agent **must not**:
> - Modify any other file outside `kupua/` without explicit approval
> - Modify any Scala code under `media-api/`, `kahuna/`, etc.
> - Add code to kupua that replicates server-side logic (cost calculation,
>   permission checks, validity rules) — instead, fetch from the API
> - Construct media-api URLs by string concatenation — always follow links
>   from the HATEOAS response
> - Write or update any image data against PROD or CODE clusters

### Per-session protocol

At session start, the agent should:

1. Confirm which workplan phase is active
2. Confirm the slow-log validation gate has been passed (check worklog)
3. State the authorised scope for this session ("Phase B, usages panel,
   kupua/ only")
4. Not proceed with Grid changes outside that scope

### Failure modes to watch for

- **Agent adds a TypeScript cost calculator** because the API response
  doesn't include `cost`. Fix: check the response shape — `cost` is in
  `ImageResponse.create()`. If absent, ask the user, don't replicate.
- **Agent adds CORS headers to media-api** "to fix" a CORS error. Fix:
  use the Vite proxy approach instead.
- **Agent extends the ES adapter with metadata writes** to "stay
  consistent." Fix: writes go through the API adapter. Period.

---

## Branching and commit hygiene

- **One branch.** Continue on `mk-next-next-next` (or whatever the current
  long-lived branch is). Don't fork.
- **Separate commits for Grid changes.** The dev-nginx mapping (Phase 0,
  step 0.1) is a single commit, separate from any kupua changes. Makes
  cherry-picking trivial later.
- **Commit message convention for non-kupua files:** prefix with
  `[grid-config]` so they're greppable later.
- **Periodic check:** `git log --oneline mk-next-next-next ^main -- ':!kupua/'`
  should be a tiny, coherent list. If it grows, squash/reorganise.

---

## Stop conditions

This workplan should stop or pause if any of the following occurs:

1. **Slow log gate fails.** Many slow query shapes from kupua. Fix the
   foundation before more features.
2. **Auth doesn't carry across origins.** Pan-domain cookie issue.
   Escalate; don't work around.
3. **~~Argo response parsing turns out to be a nightmare.~~** ~~If Phase A reveals
   the HATEOAS envelope is much more complex than expected (Argo's
   `EmbeddedEntity` wrapping is recursive), pause and decide whether to
   build a proper Argo client or revert to direct-ES for those reads.~~
   **Softened:** The Argo `EmbeddedEntity` structure is now fully documented in contract §6.1, and the reconciliation rules for merged fields are in §3.2.1. The envelope is non-trivial but tractable — the nesting pattern is consistent and documented. Phase A scaffolding now exercises the unwrap helpers against §10 fixtures specifically so this risk surfaces before any cluster ships. If implementation reveals a genuinely unparseable edge case, stop and ask; but do not treat the complexity as a blocker without first consulting §6.1.
4. **Permission gating doesn't match expectations.** If actions appear/disappear
   in unexpected ways, the model is wrong. Investigate before building more
   on it.
5. **A real Scala collaborator becomes available.** Then revisit
   `integration-plan-api-first.md` Phases 1–4 — search migration becomes
   feasible. May change the priority order.
6. **Real-user pilot reveals dealbreaking gaps.** If users say "I can't use
   this without X," reorder phases to deliver X.

---

## Decision log to maintain

In `kupua/exploration/docs/changelog.md`, log each of these as they happen:

- [ ] Slow log gate result and decision
- [ ] Phase 0 completed with notes on CORS resolution chosen
- [ ] Argo envelope parsing decisions
- [ ] First Phase A image detail comparison: API-sourced vs ES-sourced —
      which fields differ, which are richer
- [ ] Each Phase B feature shipped, with link to the HATEOAS path used
- [ ] First Phase C write — what was written, against which environment,
      what verified
- [ ] Any deviation from this workplan, with reason

---

## What this plan deliberately does *not* address

- **Production deployment.** Kupua's production hosting story (S3+CloudFront?
  Behind nginx? New Play service?) is not in scope. Worth its own document
  before any production thoughts.
- **Migration of search to API-first.** That's `integration-plan-api-first.md`
  Phases 1–4. Requires Scala collaboration. Defer.
- **imgproxy as Grid infrastructure.** Parallel workstream from
  `integration-plan-api-first.md`. Defer.
- **Multi-tenancy / Grid fork support.** Eelpie's use case. Out of scope
  until Guardian's own kupua story is settled.
- **WebSocket/SSE for live updates.** Eventual consistency lag handled by
  optimistic updates + refetch in Phase C. Real-time push is a future
  enhancement.

---

*End of workplan. Update worklog-current.md when starting any phase.*
