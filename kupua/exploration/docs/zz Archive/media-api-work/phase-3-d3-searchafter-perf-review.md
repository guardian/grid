# D3 `search-after` — performance review (candidate bottlenecks + measured findings)

**Date:** 2026-06-13
**Status:** Review complete. Temporary instrumentation added, measurements taken,
instrumentation reverted. No behaviour changes, no commits.

---

## Measured findings (2026-06-13)

### Setup

- 200 hits/page, Home reload, `--use-media-api` + TEST tunnel, dev machine.
- Four instrumentation points (all reverted after measurement):
  - ES `took` (internal query time) + wall time around `executeAndLog` in
    `ElasticSearch.searchAfter` → isolates ES transport
  - `createMs` accumulator (per-hit `hitToImageEntity` loop) + `serialiseMs`
    (`Json.toJson` + `Ok(...)`) in `MediaApi.searchAfterImages`
  - Per-hit `signUs` (nanoTime around all three `s3Client.signUrl` calls) in
    `ImageResponse.create`
  - Three client marks (`t1` after `fetch`, `t2` after `res.json()`, `t3` after
    the map loop) in `apiSearchAfter`

### Numbers (two consecutive page-1 requests, representative)

| Phase | Time |
|---|---|
| ES internal (`took`) | 212–239ms |
| ES transport (media-api ↔ ES, SSH tunnel) | 533–552ms |
| Envelope: `hitToImageEntity` ×200 (`createMs`) | ~129ms |
| — of which: S3 presigning ×200 (~145µs/hit avg) | ~29ms (22%) |
| — of which: transforms + validity + persistence + aliases + links | ~100ms (78%) |
| Envelope: `Json.toJson` + `Ok(...)` serialisation | 8ms |
| Client: body streaming + `JSON.parse` | 12ms |
| Client: `extractEnrichment` + `mapApiImageToImage` ×200 | ~0ms |
| **Total client-observed (`fetchDuration`)** | **~972ms** |

### Key findings

**Finding 1 — The dev tunnel is the dominant cost and is not fixable in code.**
ES transport accounts for ~550ms of the ~970ms total. This is the SSH tunnel between
the local media-api process and the TEST ES cluster. **Both** dev routes cross the
same tunnel — `--use-TEST` (direct ES) also uses it for kupua's own ES calls. The
direct-ES path is faster in dev for two reasons: (a) kupua's 30-field `_source`
projection returns ~250KB vs ~340KB, so less data crosses the tunnel, and (b) there
is no media-api envelope build (~137ms) added on top of the tunnel cost. The
comparison between `--use-media-api` and `--use-TEST` is therefore structurally
unfair in dev and gives a false impression of production performance.

In prod, media-api and ES are separate AWS services (separate EC2 instances in the
same VPC/region — not co-located). But the media-api→ES hop is ~2-5ms over the
internal network, not 540ms over an SSH tunnel. That is the actual prod advantage:
not architectural proximity, just the absence of a developer tunnel.

**Finding 2 — Gzip is already on everywhere; B-1 is a non-issue.**
Both the local dev nginx (`api.media.local.dev-gutools.co.uk`) and prod CloudFront
(`Content-Encoding: gzip`, `Via: ...cloudfront.net`) compress responses. The prior
payload-perf doc's ~1.3ms/KB estimate implicitly included gzip. No action needed.

**Finding 3 — The envelope (137ms) is real and matters on prod.**
On prod with a fast media-api↔ES link (say 50ms round-trip), the envelope would
be ~57% of total request time. The envelope is the one lever that's both measurable
today and worth improving for real users.

**Finding 4 — Signing is 22% of the envelope, not the main culprit.**
~145µs per hit × 200 = ~29ms. Real, worth eliminating eventually (kupua discards all
signed URLs and builds its own from the image id), but not what to fix first.

**Finding 5 — The JSON transform chain is the main envelope cost (~60-70% of the
100ms "rest of create").**
`ImageResponse.create` chains 12 `.flatMap(source.transform(...))` calls. Each
Play JSON `transform` traverses and re-creates the entire `JsObject` tree. That is
~2,400 full-tree rewrites per page. This is an **implementation mechanism cost**,
not an Argo cost — the same Argo-shaped output could be built in one direct
`JsObject` construction at a fraction of the cost.

**Finding 6 — Argo structure itself is not the problem. A lean one-pass writer was
built, measured, and deliberately reverted.**
The expensive part is (a) the 12-step `source.transform(...)` chain — each call
re-traverses and re-creates the full JsObject — and (b) the ~8-10 `imageLinks`
per hit (editorial links kupua doesn't read).

A `createForBrowse` method was implemented on `ImageResponse` as a parallel to
`create()`. It replaced the 12-transform chain with: one `imageResponseWrites` call,
per-subobject patch (source/thumb/png/metadata/usageRights/userMetadata, one
`.asOpt[JsObject]` read each), and a single `baseJson ++ Json.obj(...)` merge.
Links were set to `Nil`; actions and all enrichment fields were kept identical.

**Measured result (200 hits, TEST tunnel, warm JVM):**
`hitToImageEntity/create()`: 129ms → `createForBrowse`: 68–81ms (**42% reduction**,
137ms total envelope → ~82ms).

**Reverted. Reason: 55ms absolute saving doesn't justify the maintenance cost.**
The method was ~120 lines of parallel enrichment logic that must stay in sync with
`create()` as the Image model and enrichment rules evolve. The prod transport
assumption (2-5ms) that made the 42% envelope improvement look significant in
end-to-end terms was judged optimistic — production infrastructure details aren't
confirmed. The improvement is real but not large enough to earn permanent complexity.

**If reconsidered in future:** the approach is sound and measured. The key design
choices were: (1) `imageResponseWrites` for base serialisation, (2) read
sub-objects once from `baseJson` rather than chained transforms, (3) single `++`
merge, (4) skip `imageLinks` since browse clients don't read `entity.links`.
A contract test (response fields match `create()` output on the same fixture)
would be the mandatory guardrail before re-shipping.

**Finding 7 — Client-side cost is negligible.**
Body parse (12ms) and map (~0ms) are not worth touching. B-5 is closed.

### What this means for direct-ES vs media-api parity

In dev: both routes cross the same SSH tunnel. The gap (~700ms) is the media-api
envelope build (~137ms) plus the extra payload weight through the tunnel (~90KB more
→ ~117ms at 1.3ms/KB). There is no code change that bridges a 540ms tunnel — this
gap is a dev-environment artefact.

On prod: media-api→ES is ~2-5ms (same AWS VPC). If the lean envelope writer ships,
the endpoint's server-side cost becomes ~90ms ES + ~40ms envelope = ~130ms total,
competitive with any enriched API response benchmark.

### Backlog items (parked, not for this commit)

| Item | Effort | Impact |
|---|---|---|
| Lean one-pass Argo response writer for browse endpoint (skip editorial links, one-pass JsObject, skip signed URLs) | M — real design task, needs contract test | **Measured: ~55ms saving (42% envelope reduction). Built and reverted 2026-06-13 — saving not large enough to justify maintenance cost. Full design + measurement in Finding 6.** |
| Skip S3 presigning for kupua (kupua builds own URLs) | S — gate presigning behind a flag or omit for this endpoint | ~29ms |
| ~~Single-pass `extractEnrichment`+`mapApiImageToImage` (remove double iteration)~~ | ~~XS~~ | **Done 2026-06-13. Was ~0ms impact; kept as code quality improvement.** |

---

## Original review (pre-measurement)

**Status at time of writing:** Read-only review. No code written, no tests run, no behaviour changed.
**Mindset:** performance only (not a bug-hunt; correctness noted only where it
intersects perf). Out-of-scope correctness observations are parked in the appendix.
**Question this serves:** *why is kupua `--use-media-api` slower than `--use-TEST`
(direct ES), and which levers are worth pulling?*

**Inputs read:** `ElasticSearch.searchAfter` ([ElasticSearch.scala:514](../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala)),
`MediaApi.searchAfterImages` + `hitToImageEntity` ([MediaApi.scala:771](../../../../media-api/app/controllers/MediaApi.scala)),
`ImageResponse.create` + `imageResponseWrites` ([ImageResponse.scala:60](../../../../media-api/app/lib/ImageResponse.scala)),
`S3.signUrl` ([S3.scala:72](../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/S3.scala)),
the TS adapter ([grid-api-search-adapter.ts](../../../src/dal/grid-api-search-adapter.ts),
[strangler-adapter.ts](../../../src/dal/strangler-adapter.ts)), the Vite proxy
([vite.config.ts](../../../vite.config.ts)), and the prior payload investigation
([phase-3-d3-searchafter-payload-perf-findings.md](phase-3-d3-searchafter-payload-perf-findings.md)).

---

## Perceived-perf run — first full `--use-media-api` run (2026-06-13)

**Source:** `e2e-perf/results/perceived-log.json`, entries 43 (short, label
`"After search-after --use-media-api fieldAliases fix"`) and 44 (long, same label).
Entry 41/42 (`"After search-after --use-media-api"`) is excluded — filedAliases was
not hooked up, making it structurally incomplete. These numbers are dt_settled_ms p50,
3 runs each.

### Short suite (PP probes)

| Probe | ES-base Apr-24 | ES-b1b2 Jun-01 | ES-usage Jun-09 | API-fix Jun-13 | vs ES-base | vs last-ES |
|---|---|---|---|---|---|---|
| PP1  home-logo click            | 609ms | 290ms | 315ms |  926ms | +52%  | +193% |
| PP2  sort-no-focus              | 411ms | 291ms | 276ms |  822ms | +100% | +197% |
| PP3  sort-around-focus          | 866ms | 557ms | 567ms | 1444ms | +66%  | +154% |
| PP4  sort-direction-toggle      | 825ms | 539ms | 543ms | 1472ms | +78%  | +171% |
| PP5  filter-toggle              | 940ms | 553ms | 559ms | 1284ms | +36%  | +129% |
| PP7  scrubber-seek (click 50%)  |1163ms | 741ms | 773ms | 1735ms | +49%  | +124% |
| PP7b scrubber-drag              |1116ms | 665ms | 596ms | 1496ms | +34%  | +151% |
| PP8  search-submit warm         |1208ms | 705ms | 755ms | 1668ms | +38%  | +120% |
| PP9  cql-chip-remove            | 618ms | 259ms | 252ms |  908ms | +46%  | +260% |
| PP10 position-map ~21k          |2311ms |2523ms |2669ms | 2201ms |  -5%  |  -18% |
| PP6  density-swap (grid→table)  | 220ms | 225ms | 214ms |  261ms | +18%  |  +21% |
| PP6b density-swap mid           | 306ms | 458ms | 403ms |  288ms |  -6%  |  -29% |
| PP6c density-swap deep          | 292ms | 375ms | 367ms |  328ms | +12%  |  -11% |
| PP7c scrubber-buffer DOM scroll | 114ms | 130ms | 131ms |  127ms | +11%  |   -4% |

### Long suite (JA/JB probes)

| Probe | ES-base Apr-24 | ES-b1b2 Jun-01 | ES-usage Jun-09 | API-fix Jun-13 | vs ES-base | vs last-ES |
|---|---|---|---|---|---|---|
| JA1 search David Young ~538 | 384ms | 244ms | 240ms |  866ms | +125% | +260% |
| JA2 image-dblclick          |  98ms | 130ms | 130ms |  142ms |  +44% |   +9% |
| JA3 metadata-click          | 287ms | 786ms |     — | 1978ms | +589% |     — |
| JB1 search avalonred ~21k   | 440ms | 272ms | 265ms |  893ms | +102% | +236% |
| JB2 facet-click sport       | 155ms | 563ms | 747ms | 1113ms | +618% |  +48% |
| JB3 facet-exclude -Avalon   | 895ms | 957ms | 981ms | 2056ms | +129% | +109% |
| JB4 scrubber-seek ~50%      |  30ms |  28ms |  29ms |   39ms |  +30% |  +34% |
| JB5 fullscreen-exit 20 trav |   2ms |  64ms |  65ms |   66ms |+3200% |   +1% |

### Interpretation

**All the latency increases are network-bound and expected.** The measured components
from the instrumented run (above) account for the gap: ES transport via tunnel
~540ms + envelope ~137ms = ~677ms of structural overhead per page. Every PP/JA/JB
probe that triggers a `search-after` call shows a ~600–900ms increase vs last-ES,
which maps directly onto that overhead.

**Client-side-only ops are flat or better.** PP6/PP6b/PP6c (density swap),
PP7c (DOM scroll), JA2 (image detail open), JB5 (fullscreen exit) are all within
noise of the ES-only runs, confirming no render regression was introduced by the
enrichment-store overlay, `extractEnrichment`, or `mapApiImageToImage` changes.

**PP10 (position-map 21k) is 18% faster than last-ES despite the extra API hop.**
The lean `_source` projection reduces payload dramatically for large result sets;
even through the extra network hop that wins. Supports the projection work's value.

**The vs-ES-base delta looks more modest (+34–129%) than vs-last-ES (+120–260%)**
because Phase 2/3 ES-direct work cut latencies roughly in half by June 9; the API
run is implicitly being held to a higher standard.

**Prod expectation:** With no tunnel (media-api↔ES ~2-5ms) and the envelope as the
remaining lever, each search operation should land in the ES-b1b2 (Jun-01) range or
better. The reverted `createForBrowse` lean writer was measured at 42% envelope
reduction (137ms → ~82ms); if re-shipped with a contract test, that would bring
prod search latency below the original Apr-24 ES-direct baseline.

---

## Section 0 — premise check (does the question hold up?)

**Yes, with one important caveat.** The prior payload-perf doc already nailed the
*dominant* dev-time factor: response **payload size × dev SSH-tunnel bandwidth**
(~1.3 ms/KB), and a lean `_source` projection was shipped (Home reload 3100ms →
~938ms). That work is sound and not re-litigated here.

What that doc **did not consider** is that the payload it measured travels
**uncompressed** (see B-1), and that the **server-side CPU to build the Argo
envelope** (`imageResponse.create` ×N hits) is a second, independent cost that the
direct-ES path skips entirely (kupua re-derives everything in TS). The remaining
gap between `--use-media-api` and `--use-TEST` is therefore plausibly **(a) no
compression + (b) per-hit enrichment CPU + (c) the extra dev proxy/TLS hop**, in
roughly that order of suspected leverage.

**Caveat to carry through the whole doc:** most of these are **dev-environment
artefacts**. Direct-ES (`--use-TEST`) is fast in dev *because* kupua hand-picks a
~30-field `_source` and does zero server enrichment — it is not a fair
apples-to-apples comparison to a fully-enriched, server-authoritative API. On prod
infrastructure (fast media-api↔ES link, CDN/ELB likely gzipping) the picture
changes. **Verify prod-relevance before investing** — each item below states
whether it is dev-only or also-prod.

---

## Section 1 — verification methodology (reuse the existing harness)

The prior investigation already established the right instrument. Re-use it:

- **`r.result.took`** — ES's own internal time (excludes transport). Already
  available on the `SearchResponse` inside `searchAfter`.
- **`executeAndLog(...)`** wraps **only** the ES round-trip, so
  `executeAndLog_wall − took ≈ transport` (media-api ↔ ES over the tunnel).
- **A third timer is missing and worth adding temporarily**: wall-clock around the
  `raw.hits.map(hitToImageEntity ...)` + `Json.toJson` block in
  [MediaApi.scala:809-817](../../../../media-api/app/controllers/MediaApi.scala).
  That isolates **envelope-build + serialization CPU** from ES and from transport.
- **Client-side**: `apiSearchAfter` already records `fetchDuration = Date.now()-t0`
  ([grid-api-search-adapter.ts](../../../src/dal/grid-api-search-adapter.ts)) which
  spans the whole fetch incl. `res.json()`. Add a second mark after `res.json()` to
  split network from parse+map.

With those four marks (ES `took`, ES transport, server envelope-build, client
parse+map) every hypothesis below becomes falsifiable from **one reload**. All
diagnostics must be marked `TEMP — REVERT before commit` (the prior doc's discipline).

> ⚠️ Running any of these against TEST is read-only and fine, but the perf surfaces
> (`test:perf`) need port 3000 free — stop the dev server first and confirm before
> running. (User directive.)

---

## Section 2 — candidate bottlenecks, ranked by suspected leverage

Severity is by **code behaviour**, not user importance:
**L (large** = plausibly >100ms/page or a multiplier**), M (medium), S (small)**.
Confidence is the strength of the *evidence*, not of the fix.

### B-1 — Responses are not gzip-compressed  ·  L · also-prod-maybe · confidence: high

**What.** media-api has **no `GzipFilter`**. There is no `HttpFilters` class, no
`play.filters.enabled += ...GzipFilter`, and no `conf/application.conf` in the repo
at all (config is loaded from S3/dev) — so the app runs Play's **default** filter
chain, which does **not** include gzip. The lean `search-after` response
(~250–340KB JSON per 200-hit page, per the payload doc) therefore crosses the dev
tunnel **uncompressed**.

**Why it matters.** JSON of this shape (repetitive keys, lots of strings/URLs)
typically compresses **5–10×**. The prior doc found transport is ~linear at
~1.3 ms/KB over the tunnel and is the dominant cost. Compression attacks that cost
**directly** and is the one lever the prior doc never pulled. The browser already
sends `Accept-Encoding: gzip`; the server simply isn't honouring it.

**How to verify (one curl, no code):**
```
curl -s -D - -o /dev/null -H "Accept-Encoding: gzip" \
  -H "Content-Type: application/json" --data '<a real search-after body>' \
  https://api.media.local.dev-gutools.co.uk/images/search-after
```
Check for `Content-Encoding: gzip` in the response headers. **Expected if the
hypothesis holds: header is absent.** Then add `GzipFilter` (one `HttpFilters`
class + `play.filters.enabled += play.filters.gzip.GzipFilter`), reload, and
compare the `executeAndLog`-to-client wall time. Expected: transport leg drops
several-fold on the 250–340KB payload.

**Prod relevance — verify before claiming a prod win.** In prod the browser reaches
media-api via CloudFront/ELB which **may already gzip** at the edge. Confirm with
`curl --compressed -D -` against the real `api.media.*` whether prod responses carry
`Content-Encoding: gzip`. If prod is already compressed, B-1 is **dev-only** (but
still a large dev win and trivially safe). If prod is *not* compressed, this is a
real prod bandwidth/GC win too.

**Fix sketch.** Add `GzipFilter` to media-api's filter chain (gate to `application/*`
+ `vnd.argo+json`). Cheap, additive, behaviour-preserving for all existing routes.
⚠️ It applies to *every* media-api response, not just this endpoint — so it widens
blast radius slightly; confirm Kahuna's existing endpoints still behave (they should;
gzip is content-transparent).

---

### B-2 — Argo envelope: `imageResponse.create` runs full enrichment ×N hits  ·  L · also-prod · confidence: high

**What.** For every hit, `hitToImageEntity` → `imageResponse.create`
([ImageResponse.scala:60](../../../../media-api/app/lib/ImageResponse.scala)) does
the **full single-image enrichment**: a ~12-step chained `JsObject.transform`
pipeline (`addSecureSourceUrl`, `wrapUserMetadata`, `addSecureThumbUrl`,
`addSecureOptimisedPngUrl`, `addValidity`, `addInvalidReasons`, `addUsageCost`,
`addPersistedState`, `addSyndicationStatus`, `addAliases`, `addFromIndex`,
`updateCustomSpecialInstructions`, `updateCustomUsageRestrictions`), plus
`checkUsageRestrictions`, `ImageExtras.validityMap`, `imagePersistenceReasons`,
`extractAliasFieldValues`, and `Costing.getCost`. At **200 hits/page** that is
**~2,400 JSON-tree transforms/page** plus the per-hit validity/persistence/cost
computation. The direct-ES path (`--use-TEST`) does **none** of this server-side —
it ships raw `_source` and re-derives in TS. That asymmetry is a prime suspect for
the residual gap.

**This is the "Argo envelope" the user flagged — and it has three wasteful
sub-parts that the kupua endpoint specifically does not need:**

- **B-2a — Wasted S3 presigning.** `imageResponse.create` always computes a signed
  source URL (`s3Client.signUrl`, [S3.scala:72](../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/aws/S3.scala)),
  plus an optimisedPng signed URL when present, plus a signed thumb URL when no
  CloudFront thumb domain is configured. `generatePresignedUrl` is a **local HMAC
  signing** (no network), but it builds a request object + response-header overrides
  + signs, **per URL, per hit** → ~200–600 signings/page. **kupua discards all of
  them** — it builds its own thumbnail (`/s3/thumb/<id>`) and imgproxy URLs from the
  image id ([image-urls.ts:50](../../../src/lib/image-urls.ts)) and never reads the
  server's `secureUrl`. So this is pure wasted CPU on the hot path for *this*
  endpoint. **also-prod** (real Kahuna needs the signed URLs; kupua does not).
- **B-2b — Request-constant work recomputed per hit.**
  `canUserDeleteCropsOrUsages(request.user)` is evaluated **inside** the per-hit
  `hitToImageEntity` ([MediaApi.scala:777](../../../../media-api/app/controllers/MediaApi.scala))
  even though it depends only on the principal, not the image → 200× redundant
  permission evaluation/page. (Pre-existing pattern, inherited from `imageSearch`.)
- **B-2c — Per-hit `links` + `actions` for Internal tier.** `imageLinks` builds
  ~10 `Link`s with string interpolation and `new URI(...)`/imgops URI construction
  per hit; kupua reads `actions` (via `extractEnrichment`) but not `links`. The link
  construction is ~200×10 URI builds/page the client largely ignores.

**How to verify.** Add the server envelope-build timer (Section 1) around the
`raw.hits.map(hitToImageEntity ...)` block. Expected if B-2 is significant: that
block is tens-to-hundreds of ms/page, comparable to or exceeding ES `took`.
Then A/B individual sub-parts:
- B-2a: temporarily stub the three `signUrl` calls to return `""` and re-time. If
  the envelope-build time drops materially, presigning is a real cost.
- B-2b: hoist `canUserDeleteCropsOrUsages` out of the loop; re-time.
- B-2c: skip `links` for this endpoint (it's a JSON object kupua ignores); re-time.

**Fix sketch (design, not for this commit).** The clean long-term answer is a
**leaner response writer for the kupua/browse endpoint** that computes only what
kupua consumes (cost/valid/persisted/actions/isPotentiallyGraphic/aliases + raw
display fields) and **skips S3 presigning + Internal links**. This is a real design
task with a contract test (the existing guardrail) — *do not* bolt it on blind.
Quantify B-2 first; if envelope-build is small relative to transport, B-1 alone may
close most of the gap and B-2 can wait.

---

### B-3 — Double / large JSON serialization on the request thread  ·  M · also-prod · confidence: medium

**What.** After enrichment, the controller does
`Json.toJson(imageEntities)` then wraps it in another `Json.obj(...)` and
`.as(ArgoMediaType)` ([MediaApi.scala:810-817](../../../../media-api/app/controllers/MediaApi.scala)).
Each `EmbeddedEntity` was already a `JsValue`; re-running `Json.toJson` over the
collection re-walks the whole tree, and Play then serialises it to bytes. For a
200-hit, ~300KB payload this is non-trivial CPU, and it runs on the default
execution context (the same pool serving requests).

**How to verify.** Covered by the same server envelope-build timer if you place the
end mark *after* `Json.toJson`/`Ok(...)`. Split the mark before vs after
`Json.toJson` to separate enrichment from serialization. Expected: serialization is
a smaller slice than enrichment, but measurable.

**Fix sketch.** Avoid the redundant re-wrap (build the final `JsObject` directly
from the already-`JsValue` entities), and/or stream the response. Low priority until
B-2 is quantified — they share a timer.

---

### B-4 — Extra dev proxy + TLS hop (Vite → HTTPS media-api)  ·  M · dev-only · confidence: medium

**What.** kupua → **Vite dev proxy** → `https://api.media.local.dev-gutools.co.uk`
with `changeOrigin: true, secure: false` and an `Origin` header spoof
([vite.config.ts:124-180](../../../vite.config.ts)). That is an extra
single-threaded Node hop **and** a TLS handshake to an HTTPS target on every request
(vs direct-ES which Vite also proxies, but to plain `http://localhost:9220`). The
proxy also buffers the full response body before relaying. No keep-alive tuning is
configured, so connection reuse to the HTTPS target is whatever http-proxy defaults
to.

**How to verify.** `curl` the media-api endpoint **directly** (bypassing Vite) and
compare wall time to the same call **through** the `/api` proxy. Expected if B-4
matters: a consistent per-request delta (handshake + buffering). Repeat with
`curl --no-keepalive` vs reused connection to isolate handshake cost.

**Fix sketch.** Dev-only, so low stakes: point the proxy at plain HTTP if media-api
exposes one locally, and/or enable keep-alive on the proxy agent. Not a prod concern
(prod has no Vite). **Verify it's real before touching** — modern TLS + keep-alive
may make this negligible.

---

### B-5 — Client parses + double-iterates 200 hits on the main thread  ·  M · also-prod · confidence: medium

**What.** `apiSearchAfter` does `await res.json()` (parses the full ~300KB payload
on the main thread), then iterates `json.data` **twice**: once to build the
`enrichment` map (`extractEnrichment`) and once to build `hits` (`mapApiImageToImage`)
([grid-api-search-adapter.ts](../../../src/dal/grid-api-search-adapter.ts)). Both
`extractEnrichment` and `mapApiImageToImage` re-unwrap the same Argo
`usages`/`leases`/`collections` nesting, so that unwrap runs twice per hit. This is
main-thread work that competes with React render → candidate for **perceived** jank,
not just throughput.

**How to verify.** Add a client mark after `res.json()` (split network vs
parse+map). Run the perceived-perf trace
(`npm --prefix kupua run test:perf -- --perceived-only --runs 3 --label "search-after"`,
**after** confirming :3000 is free). Expected if B-5 matters: a visible
parse+map slice on the main thread around commit-to-view.

**Fix sketch.** Single pass over `json.data` building both `hits` and `enrichment`
together (the usages unwrap is computed once and shared). Small, safe TS change —
but quantify first; 200 objects is not obviously expensive.

---

### B-6 — `isPotentiallyGraphic` Painless script field ×N hits  ·  S · also-prod · confidence: low

**What.** The endpoint adds a Painless script field evaluated **per hit**
([ElasticSearch.scala](../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala),
`searchAfterGraphicScriptField`) reading `params['_source']`. 200 script evals/page.

**How to verify.** A/B: drop the script field, re-measure `r.result.took`. Expected:
small delta (scripts over `_source` are cheap-ish but non-zero). The prior doc
verified correctness under projection; this only asks about cost.

**Fix sketch.** None unless the A/B shows a real `took` delta. Likely a non-issue;
listed for completeness so it isn't re-investigated later.

---

### B-7 — First-page `trackTotalHits(true)` over 1.3M docs  ·  S · also-prod · confidence: high it's needed

**What.** First page sends `countAll=true` → `trackTotalHits(true)`
([ElasticSearch.scala:573](../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala)),
forcing ES to count **all** matching docs (~1.3M). Subsequent pages send
`countAll=false`. Exact total is a **product requirement** (the scrubber needs it),
so this is largely unavoidable.

**How to verify.** A/B `trackTotalHits(true)` vs `trackTotalHits(10000)` on the
first page, compare `r.result.took`. The prior doc already saw `took` ~90–160ms
including the count, so the count is probably a small fraction. **Do not "optimise"
this away** — losing the exact total breaks the scrubber. Listed only to pre-empt a
tempting-but-wrong fix.

---

## Section 3 — suggested verification order (cheapest signal first)

1. **B-1 gzip** — one `curl -D -`. If `Content-Encoding` is absent (expected), this
   is the highest-leverage, lowest-risk lever. Check prod compression too.
2. **Add the 4 timers** (Section 1), do one `--use-media-api` Home reload, and read
   off: ES `took`, ES transport, server envelope-build, client parse+map. This one
   reload disambiguates B-2/B-3/B-5 vs B-1/B-4 in a single shot.
3. **B-4** — direct-vs-proxy `curl` delta (dev-only; only if transport still looks
   high after gzip).
4. **B-2 sub-parts** — only if the envelope-build timer is large: A/B presigning,
   per-hit constant work, links.
5. Treat **B-6 / B-7** as expected-non-issues; confirm with quick A/Bs only if 1–4
   don't explain the gap.

**Decision rule.** If, after B-1 (gzip), the `--use-media-api` Home reload lands
within ~1.5× of `--use-TEST`, **stop** — the remaining gap is the intrinsic cost of
server-authoritative enrichment and is a prod-irrelevant dev artefact. Only pursue
B-2's leaner writer if envelope-build CPU is independently large (it is **also-prod**,
so it's the one worth fixing for real users even if dev transport is solved).

---

## Section 4 — what is NOT worth chasing (anti-goals)

- **The lean `_source` projection** — already done and effective. Don't revisit.
- **Route co-location / "mix" theories** — the prior doc ruled these out empirically.
- **Removing the exact total count** — product-required (B-7). Off limits.
- **PIT handling / null-zone logic** — correctness machinery, not on the perf hot
  path (one `exists` filter; negligible).
- **Reflection-derived projection field list** — computed once into a `val`; zero
  per-request cost. Not a bottleneck.

---

## Appendix — out-of-scope observations (≤ one line each, not perf-critical)

1. `canUserDeleteCropsOrUsages` per-hit recomputation (B-2b) is also a tidiness
   smell inherited from `imageSearch` — worth hoisting there too, separately.
2. `extractEnrichment` and `mapApiImageToImage` duplicate the Argo unwrap logic
   (B-5) — a shared unwrap helper would DRY both.
3. The `/api` proxy spoofs `Origin` to Kahuna's domain (deviations.md §28) — dev
   ergonomics, not perf.

---

## What "done" looks like

This review is complete when: each candidate has a falsifiable verification step
(✓), the cheapest-signal-first order is stated (✓ Section 3), the dev-vs-prod
relevance of each is called out (✓), and tempting-but-wrong fixes are fenced off
(✓ Section 4 / B-7). It deliberately does **not** prescribe code changes — the next
step is to run the Section 3 measurements and let the numbers pick the lever.
