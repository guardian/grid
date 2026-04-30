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
5. [Phase A — First read-only API call: image detail](#phase-a--first-read-only-api-call-image-detail)
6. [Phase B — Read operations through HATEOAS](#phase-b--read-operations-through-hateoas)
7. [Phase C — Write operations through HATEOAS actions](#phase-c--write-operations-through-hateoas-actions)
8. [Architectural rule: where each call goes](#architectural-rule-where-each-call-goes)
9. [Agent guardrails](#agent-guardrails)
10. [Branching and commit hygiene](#branching-and-commit-hygiene)
11. [Stop conditions](#stop-conditions)
12. [Decision log to maintain](#decision-log-to-maintain)

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

**When to use:** Phase 0 and early Phase A. You're testing wiring, not
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
   KUPUA_ES_URL=http://localhost:9200 npm --prefix kupua run dev -- --skip-es
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

**When to use:** Most of Phase A, B, and C. You want realistic data
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

This is the foundation of the API-first surface. It's the *only* config
kupua needs about Grid in production: one URL.

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

## Phase A — First read-only API call: image detail

**Scope:** When user opens an image's detail view, fetch it via
`GET /images/{id}` from media-api instead of using the buffered version
from search results. Display all the enriched fields the API returns.

**Time:** 3–5 days.

**Risk:** Low. Read-only, well-scoped, single screen.

**Grid changes:** Zero. The endpoint exists today.

**Why this first:**
- Smallest possible end-to-end test of the API-first approach
- One screen, easy to compare to current behaviour
- If the Argo response format is painful to parse, we discover it here, not
  spread across the whole app
- Immediately delivers user value: proper cost/validity badges,
  signed thumbnail URLs that work in production, server-side permission
  gating

### Concrete steps

#### A.1 Look at what `GET /images/{id}` returns

The full response shape is documented in contract **§3** (Phase A endpoints — image detail). Key reference points:
- §3.2 always-present and conditionally-present field tables
- §3.2.1 reconciliation rules (how `metadata`, `usageRights`, `cost` are derived)
- §3.3 the `actions` array — full enumeration with conditions
- §3.4 the `links` array — full enumeration
- §10 annotated real response samples from TEST (three images)

**Read §3 before writing any parsing code.**

#### A.2 Define the API-side image type

Create `kupua/src/dal/grid-api/types.ts`. The TypeScript types are already drafted in contract **§9** (`ImageResponse`, `ImageData`, `EmbeddedEntity`, `UsageRights`, `Embedding`, `SyndicationRights`, `FileMetadata`, etc.) — use §9 as the starting point rather than deriving from the wire format from scratch.

Don't try to reuse the ES-derived `Image` type — they're different shapes (the API wraps things in Argo's `EmbeddedEntity` envelope). Translation happens at the adapter boundary.

#### A.3 Build a minimal `GridApiDataSource.getImageDetail(id)` method

Create `kupua/src/dal/adapters/grid-api/grid-api-adapter.ts`:

```ts
export class GridApiDataSource {
  constructor(private serviceDiscovery: ServiceDiscovery) {}

  async getImageDetail(id: string): Promise<ImageDetail> {
    const url = this.serviceDiscovery.imageUrl(id); // from the {id} template
    const response = await fetch(url, { credentials: 'include' });
    // ...handle errors, parse Argo envelope, return typed result
  }
}
```

This adapter is **separate** from the ES adapter. They don't share code,
they don't implement the same interface. The image-detail consumer chooses
which to call.

#### A.4 Wire the image detail view to use it

Find where the detail view currently reads its data (likely from the
buffer entry — kupua has an `Image` from search results). Add a fetch on
mount:

```tsx
useEffect(() => {
  gridApi.getImageDetail(imageId).then(setDetail);
}, [imageId]);
```

Render cost/validity/persistence badges from `detail`. Use the signed
URLs from `detail.thumbnail.secureUrl` and `detail.secureUrl` for image
display.

**Permissions and actions:** Trust the `actions` array in the image response
(§3.3) for what the user can do — show/hide UI controls based on action presence.
Trust the `links` array (§3.4) for what's navigable (crops link absent = no
`valid==true` or no write permission). Do NOT replicate permission logic in
TypeScript.

**Two specific traps to avoid in detail-view rendering:**

1. **`valid==true` with non-empty `invalidReasons` is normal, not a bug.** See contract §6.7.1: `valid` is recomputed after lease overrides; `invalidReasons` retains the underlying reason a lease was needed. If both are populated, treat `invalidReasons` as informational ("this is fine because of an active lease"), not as a warning. Don't render red "invalid" badges next to a green "valid" badge.
2. **Don't show the `reindex` action.** It's emitted in the `actions` array for any user with write permission, but the endpoint doesn't exist (§8 item 9, §3.3). Filter it out of any "available actions" UI. The contract's §3.3 row is now strikethrough'd / ⚠️-flagged for the same reason.

The buffer-entry data remains the *initial* render (no loading flash) —
the API-fetched detail enriches it once arrived.

#### A.5 Drop the S3 proxy for detail-view images

`scripts/s3-proxy.mjs` exists because direct-ES results don't include
signed URLs — they include raw S3 keys, and the browser can't fetch them.
For the detail view specifically, the API now provides signed URLs. So
detail-view image rendering no longer needs the proxy.

**Don't remove the proxy yet** — search results still come from ES and
still need it. Only the detail view bypasses it.

### Phase A deliverables

- [ ] `GridApiDataSource` class scaffolded
- [ ] `getImageDetail(id)` working against TEST
- [ ] Image detail view shows API-sourced cost/validity badges
- [ ] Signed thumbnail/source URLs from API used for image display
- [ ] Documented the Argo envelope parsing (notes for future phases)
- [ ] `deviations.md` entry: "two parallel data adapters intentionally —
      see integration-workplan-bread-and-butter.md"
- [ ] Vitest tests for the new adapter (mock the fetch, assert parsing)

---

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
3. **Argo response parsing turns out to be a nightmare.** ~~If Phase A reveals
   the HATEOAS envelope is much more complex than expected (Argo's
   `EmbeddedEntity` wrapping is recursive), pause and decide whether to
   build a proper Argo client or revert to direct-ES for those reads.~~
   **Softened:** The Argo `EmbeddedEntity` structure is now fully documented in contract §6.1, and the reconciliation rules for merged fields are in §3.2.1. The envelope is non-trivial but tractable — the nesting pattern is consistent and documented. If implementation reveals a genuinely unparseable edge case, stop and ask; but do not treat the complexity as a blocker without first consulting §6.1.
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
