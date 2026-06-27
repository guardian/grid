# D3 `search-after` — performance deep-dive (evidence-based)

**Date:** 2026-06-14
**Status:** Investigation complete. All findings below are **measured**, not inferred,
except where explicitly flagged. Temporary instrumentation (ES-client gzip, script-field
A/B) was applied live and reverted; nothing committed.

> **Why this doc exists.** Two earlier docs
> ([payload-perf-findings](phase-3-d3-searchafter-payload-perf-findings.md),
> [perf-review](phase-3-d3-searchafter-perf-review.md)) established that
> `--use-media-api` Home reload is ~3× slower than `--use-TEST` (direct ES) in dev. But
> their *interpretation* of the gap was wrong in an important way: they attributed ~2/3 of
> the slowdown to "the SSH tunnel" — a cost **both** routes supposedly share equally. That
> can't be right: direct-ES's *entire* reload (~274ms) is smaller than media-api's
> *transport leg alone* (~540ms), over the **same** tunnel, same laptop, same cluster. This
> doc resolves that paradox with direct measurement and separates the levers that would help
> **only dev** from those that would also help the **live production Grid**.

---

## TL;DR — where the levers actually are

| Lever | Mechanism | Saving (dev, /page) | Helps PROD? | Confidence |
|---|---|---|---|---|
| **ES-client gzip** (media-api↔ES) | client never sends `Accept-Encoding`; ES returns 5× larger response | **~440ms** | **Latency: dev-only.** Bandwidth/CPU/GC: yes, but minor | **measured (live)** |
| **Drop `isPotentiallyGraphic` script** | per-hit Painless `params['_source']` read | ~30ms | **Yes — also-prod** | measured (A/B) |
| **Lean envelope writer** | replace 12-step `JsObject.transform` chain | ~55ms | **Yes — dominant lever on prod** | measured (built+reverted) |
| **Skip S3 presigning for browse** | kupua discards all signed URLs | ~29ms | **Yes — also-prod** | measured |
| `trackTotalHits=true` (page 1) | exact count over ~1.3M docs | +28ms (unavoidable) | n/a — product requirement | measured (A/B) |
| `sourceInclude` vs `sourceExclude` | projection shape | +2ms (noise) | n/a | measured (A/B) |

**The single biggest dev factor is compression**, and it fully explains the "same tunnel"
paradox. **The single biggest prod factor is the envelope build** (because on prod the
transport cost the gzip lever attacks is already near-zero).

---

## The paradox, and its resolution

The prior docs measured `executeAndLog − took ≈ 540ms` and called it "tunnel transport,"
implying it is a fixed tax both routes pay. Two things are wrong with that:

1. **`executeAndLog` is not pure transport.** It wraps `client.execute(...)`
   ([ElasticSearchExecutions.scala](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchExecutions.scala)),
   whose Future only completes after elastic4s has **read the entire HTTP body and parsed
   the response envelope**. So the leg includes media-api-side I/O + CPU, not just the wire.

2. **The two routes do not push the same bytes through the shared tunnel.** This is the
   crux, and it is now measured:

| Route | What crosses the tunnel | Bytes (200 hits) |
|---|---|---|
| **direct-ES** (browser `fetch` → Vite `/es` proxy → ES) | **gzip** — browser auto-sends `Accept-Encoding: gzip`; ES honours it | **~63 KB** |
| **media-api** (elastic4s `JavaClient` → ES) | **uncompressed** — the ES client never sends `Accept-Encoding` | **~373 KB** |

Same tunnel. ~5× the bytes. At the measured effective tunnel rate (~708 bytes/ms ≈
690 KB/s, derived from 373 KB in ~540 ms), that's ~540 ms vs ~92 ms — which is exactly why
direct-ES's whole reload fits in ~274 ms while media-api's "transport leg" alone is ~540 ms.
**The tunnel was never the differentiator; the bytes-on-wire were.**

> **Internal cross-check (no new measurement needed):** 308 KB *uncompressed* at 708 bytes/ms
> = 446 ms, which already exceeds direct-ES's *entire* 188 ms non-ES budget. Direct-ES
> therefore **cannot** be shipping uncompressed bytes — it must be gzipped. The model
> predicts direct-ES's compressed transport at 92 ms; the direct-ES breakdown
> (274 total − 86 `took` − ~96 client/proxy) leaves ~92 ms. Exact match. The bandwidth model
> is self-consistent.

---

## Methodology

All numbers below come from one of three instruments:

- **Wire-size curls** — the real lean-projection query issued directly to ES with and
  without `Accept-Encoding: gzip`, body sizes via `wc -c`. No app, no tunnel jitter.
- **ES `took` A/B** — 20–25 iterations of the exact query shape elastic4s sends, with the
  Painless `script_fields` / `track_total_hits` clauses toggled, reading ES's own internal
  `took` from each response. `took` is server-side ES time only — immune to tunnel, Vite,
  and Play jitter. (Reproduction commands in the appendix.)
- **Live app A/B** — a one-line ES-client gzip patch applied to the running media-api (sbt
  hot-recompile), felt directly in `--use-media-api` Home reload, then reverted.

The 4-point envelope instrumentation (ES `took`, transport, per-hit `create`, per-hit
signing, client parse) is from the [perf-review doc](phase-3-d3-searchafter-perf-review.md)
and not repeated here.

---

## Findings

### F1 — The media-api↔ES leg is uncompressed (the big dev lever)

**What.** elastic4s builds its client as `JavaClient(ElasticProperties(url))`
([ElasticSearchClient.scala](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchClient.scala)).
The underlying ES Java REST client only requests gzip if `setCompressionEnabled(true)` is
set on its builder — it is not. So ES replies uncompressed. (The elastic4s response handler
*already* decodes gzip when present — `isEntityGziped → GZIPInputStream` — so only the
request-side opt-in is missing.) By contrast, the browser's `fetch` on the direct-ES path
auto-sends `Accept-Encoding: gzip`, the Vite proxy forwards it, and ES compresses.

**Measured wire sizes (200 hits, `match_all`, real cluster):**

| Payload | Uncompressed | Gzip | Ratio |
|---|---|---|---|
| media-api lean projection (current) | 373 KB | 70 KB | **5.3×** |
| direct-ES kupua `SOURCE_INCLUDES` | 308 KB | 63 KB | 4.9× |
| full-fat (pre-projection baseline) | 1745 KB | 290 KB | 6.0× |

**Live A/B (real app, `--use-media-api` Home reload):**

| | Home reload (felt) |
|---|---|
| Current (no ES-client gzip) | **~988 ms** |
| + ES-client gzip | **~486 ms** |

Predicted from the byte model: 985 ms → 547 ms. The live result (~486 ms) is within UI
jitter of the prediction — the model holds.

**The patch that produced the win** (temporary; `JavaClient.apply` has no compression hook,
so build the `RestClient` directly):

```scala
// in ElasticSearchClient.scala `lazy val client`
val hosts = ElasticProperties(url).endpoints.collect {
  case ElasticNodeEndpoint(protocol, host, port, _) =>
    new org.apache.http.HttpHost(host, port, protocol)
}
val restClient = org.elasticsearch.client.RestClient
  .builder(hosts: _*)
  .setCompressionEnabled(true) // sends Accept-Encoding: gzip; ES returns ~5× smaller body
  .build()
ElasticClient(JavaClient.fromRestClient(restClient))
```

**Prod relevance — carefully stated.** The client code is environment-independent, and prod
ES is fronted by an **internal load balancer with a plain HTTP listener** (no compression
layer) in the **same VPC/region** as media-api. So **prod media-api↔ES also transfers
uncompressed JSON today.** But the prod link is intra-VPC (single-digit ms), so the *latency*
cost of those extra bytes is small — the dramatic dev win is an **SSH-tunnel artefact**.
What *is* also-prod is the **bandwidth, heap-allocation and GC** cost of materialising ~5×
larger response bodies on every search, on a high-QPS editorial service. That is a real but
**modest** efficiency improvement, not a latency fix.

> **Verdict:** Latency win = **dev-only** (100% sure — confirmed by topology: the prod link
> is fast and uncompressed regardless). Efficiency win (bandwidth/CPU/GC) = **also-prod, minor.**
> Worth offering to the Grid team as a low-risk, one-line, behaviour-transparent change — but
> framed as efficiency, not speed. ⚠️ It lives in `common-lib` and affects **every** Grid
> service (thrall, cropper, usage, etc.), so the blast radius is wider than this endpoint.
>
> **See below:** More measurements and a PR to main: https://github.com/guardian/grid/pull/4784

---

### F2 — The `isPotentiallyGraphic` Painless script costs ~30ms ES `took` (also-prod)

**What.** The endpoint adds a per-hit script field reading `params['_source']`
([ElasticSearch.scala](../../../../../media-api/app/lib/elasticsearch/ElasticSearch.scala),
`searchAfterGraphicScriptField`). Accessing `params['_source']` in Painless forces ES to
load and deserialize the **full stored source** per document — independent of the lean
`_source` fetch projection.

**Measured (ES `took`, 200 hits, 25 iterations each, same query otherwise):**

| | mean | median | stdev |
|---|---|---|---|
| WITHOUT script field | 33.2 ms | 33 ms | 1.1 ms |
| WITH script field | 63.1 ms | 61 ms | 6.3 ms |

**→ +30 ms mean (+28 ms median).** Tight distributions; the effect is unambiguous.

**Prod relevance:** the script runs on prod ES exactly as in dev → **also-prod, ~30ms/page.**

**Lever.** kupua's direct-ES path doesn't pay this — it fetches the raw
`fileMetadata.xmp.pur:adultContentWarning` leaf (already in `SOURCE_INCLUDES`) and computes
the flag client-side in [graphic-image-blur.ts](../../../../src/lib/graphic-image-blur.ts). The
media-api endpoint could do the same: include the raw leaf in the projection (≈0 cost — see
F4) and drop the script. This **reopens the "server owns semantics" decision** taken during
D3 implementation — but now with a measured price tag: the semantic benefit of
server-authoritative computation costs ~30ms/page on prod ES; fetching the raw field is
essentially free.

---

### F3 — `trackTotalHits=true` costs ~28ms on page 1 (also-prod, unavoidable)

**Measured (ES `took`, sourceInclude query, 20 iterations):**

| | mean | median |
|---|---|---|
| `track_total_hits` absent (default 10k) | 35 ms | 34 ms |
| `track_total_hits: true` (exact count, ~1.3M docs) | 63 ms | 62 ms |

**→ +28 ms.** Page 1 only (`countAll=true`); all extends/scrolls send `countAll=false` and
skip it. The exact total is a **product requirement** (the scrubber needs it), so this is not
a lever — listed to pre-empt a tempting-but-wrong "optimisation" and to account for the
first-page `took`.

---

### F4 — `sourceInclude` vs `sourceExclude` is free (~2ms)

**Measured:** sourceExclude baseline 33 ms vs sourceInclude (kupua's real projection +
alias leaves) 35 ms → **+2 ms, within noise.** The schema-derived include list with deep
`fileMetadata.*` leaf paths adds no meaningful ES cost. (Relevant because a prior hypothesis
guessed the projection shape might be contributing to the cross-session `took` gap — it isn't.)

---

### F5 — The Argo envelope build is ~137ms (the prod lever)

From the [perf-review 4-point instrumentation](phase-3-d3-searchafter-perf-review.md):
`hitToImageEntity` → `imageResponse.create` ×200 = ~129ms, + serialisation ~8ms. Within that:
S3 presigning ~29ms (22%), and the 12-step chained `JsObject.transform` pipeline +
validity/persistence/aliases/links ~100ms (78%). A `createForBrowse` lean one-pass writer
was built and measured at **129ms → 68–81ms (42% reduction)**, then reverted as not worth the
maintenance cost *for the dev win*.

**Prod relevance — this is the one that matters most on prod.** On prod the transport leg the
gzip lever attacks is already ~ms, so the envelope becomes the **dominant** server-side cost.
At a fast media-api↔ES link the endpoint's server time is ≈ ES `took` (~90ms) + envelope
(~137ms) = ~230ms; the lean writer would cut it to ~170ms. **Also-prod, and the highest-value
lever for real users.** The `createForBrowse` design is recorded in perf-review Finding 6;
a contract test is the mandatory guardrail before re-shipping.

**The ~55ms saving bundles two distinct optimizations with different shareability:**

1. **Transform chain → single-pass** (~78% of envelope, ~107ms of the 137ms): the 12
   chained `.transform(source...)` calls each re-traverse and re-create the entire `JsObject`
   tree. This is a pure implementation-mechanism cost — the output is identical if built via a
   single `imageResponseWrites` call + one `Json.obj(...)` merge. **This optimization lives
   entirely inside `create()` and has no call-site API change.** Every caller — Kahuna's
   existing `imageSearch`, the new `searchAfter`, and single-image `GET /images/:id` — benefits
   automatically by fixing `create()` once. See Grid team recommendations below.

2. **Skip `imageLinks` ×200** (~22%, the remaining ~30ms): the as-built `createForBrowse`
   set links to `Nil` because Kupua's browse client ignores them. Kahuna's `imageSearch`
   **actively uses all links** per search result — `getLink('crops')`, `getLink('edits')`,
   `getLink('download')`, `syncGetLinkUri(image, 'ui:image')`, `follow('usages')`,
   `follow('leases')` — confirmed across 6 Kahuna JS files. This optimization is
   **browse-endpoint-specific** and cannot be applied globally to `create()`. It can be
   exposed as an `includeLinks: Boolean = true` parameter to `create()`, set to `false` only
   by `searchAfterImages`. No parallel implementation needed; just a two-line gate.

**Summary of the two paths:**

| Optimization | In as-built `createForBrowse` | Kahuna `imageSearch`? | How to share |
|---|---|---|---|
| Transform chain → single-pass | ✅ | ✅ Yes — fix `create()` globally | Fix `create()` directly |
| Skip `imageLinks` | ✅ | ❌ Kahuna reads them | `includeLinks` param, default `true` |

---

### F6 — Route mixture compounds via shared-tunnel contention (dev)

The [strangler adapter](../../../../src/dal/strangler-adapter.ts) routes **only** `searchAfter`
to media-api; `search`, `count`, `getAggregations`, distributions, `estimateSortValue`,
`getIdRange` etc. still go **direct-to-ES**. So one Home-logo click fires a fat uncompressed
media-api `searchAfter` **plus** several direct-ES companion calls, **all sharing the one SSH
tunnel.** The perf-review doc observed a trivial healthcheck balloon to 1234ms (from ~30ms)
with a fat payload in flight — head-of-line blocking. This inflates the *perceived* settle
time of a whole action beyond what the isolated `searchAfter` breakdown predicts, and explains
why perceived deltas (e.g. PP1 home-logo +193% vs last-ES) exceed the per-call cost.

**Prod relevance: dev-only.** It is a consequence of the bandwidth-limited tunnel; F1's
compression fix (or simply the fast prod link) removes the contention by shrinking the fat
call. Not an architectural defect of the mixed-route strangler.

---

## Corrections to the prior docs (retractions)

Honesty requires flagging where earlier interpretations were wrong:

1. **"~540ms tunnel transport is structural overhead common to both routes."**
   *(perf-review, Interpretation)* — **Wrong.** It is ~373KB uncompressed vs ~70KB compressed
   over the **same** tunnel; the routes differ ~5× in bytes-on-wire. The tunnel is not a fixed
   tax. (F1.)

2. **"The `isPotentiallyGraphic` script is low-confidence / likely a non-issue."**
   *(perf-review B-6)* — **Half wrong.** It is a real, measured cost (+30ms, also-prod) — but
   it was *also* over-blamed: a cross-session comparison (89ms vs 225ms `took`) implied the
   script cost ~130ms. Clean same-session A/B shows the 130ms apparent gap decomposes as
   **~30ms script + ~28ms `trackTotalHits` + ~70ms cluster-load noise between sessions.** The
   script is one-third of what was inferred.

3. **"media-api↔ES is ~2–5ms on prod."** *(perf-review, assumed)* — **Now grounded, not
   guessed.** media-api and ES share the primary VPC/region; ES is behind an internal LB. The
   single-digit-ms figure is consistent with intra-VPC routing, but the *exact* number remains
   unmeasured (would need a prod-side probe). The qualitative claim — "fast, and uncompressed"
   — is confirmed from infrastructure config.

---

## Prod projection (grounded in topology)

With media-api and ES co-located in one VPC/region behind an internal LB (no compression
layer, fast link), the prod picture for a `searchAfter` page is approximately:

| Component | Prod estimate | Lever |
|---|---|---|
| ES `took` (incl. script + page-1 count) | ~90 ms | drop script → ~60ms (F2) |
| media-api↔ES transport | ~few ms | gzip irrelevant to latency here (F1) |
| Envelope build ×200 | ~137 ms | lean writer → ~82ms (F5) |
| Serialise + dispatch | ~10 ms | — |
| **Server total** | **~230 ms** | **→ ~155ms with F2+F5** |

The browser↔media-api leg is already gzipped on prod (CloudFront/nginx — perf-review
Finding 2), so client-perceived latency ≈ server total + a fast CDN hop. **On prod the
envelope (F5), not transport, is the thing worth optimising** — the opposite of dev.

---

## Recommendations

**For kupua (in scope, TS/endpoint):**
- **[DONE: XMP arrives via fielAlias instead; see post-phase-3-d3-searchafter-blur-graphic-work.md]** ~~**Consider dropping the `isPotentiallyGraphic` script**~~ in favour of fetching the raw leaf
  + client-side computation (F2). ~30ms/page also-prod, ~free alternative, and it unifies the
  graphic-flag path across both modes. Reopens a deliberate design decision — worth a
  conscious call, not a silent change.
- **Re-evaluate the lean envelope writer** (F5) before any prod rollout — it is the dominant
  prod lever and the design + measurement already exist. Gate behind a contract test.

**For the Grid team (out of kupua scope — flagged, not actioned):**

- **Lean `create()` — transform chain fix** (F5, shared win): the 12-step chained
  `JsObject.transform` pipeline in `ImageResponse.create` is the dominant per-hit CPU cost
  (~78% of envelope). It can be replaced with a single-pass `JsObject` construction with
  **no output change**. As measured (42% envelope reduction, 129ms → ~82ms), the full
  `createForBrowse` approach saved ~55ms — but that bundled the browse-specific link-skip
  too. The **transform chain fix alone**, applied to `create()` directly, is estimated at
  ~30–40ms per 200-hit page on prod and benefits **all bulk search callers**, including
  Kahuna's existing `imageSearch`. The link-skip can be exposed as an opt-in parameter
  (`includeLinks: Boolean = true`) for browse endpoints only — no parallel code, no
  maintenance fork. A contract test (response fields match the current `create()` output on
  a fixture) is the mandatory guardrail. The reverted `createForBrowse` design in perf-review
  Finding 6 is the starting point.

- **`isPotentiallyGraphic` script** (F2): +30ms ES `took` per page, also-prod. Consider
  fetching the raw `fileMetadata.xmp.pur:adultContentWarning` field instead of a per-hit
  Painless `params['_source']` script — eliminates the per-hit full-source read. Affects the
  `searchAfterGraphicScriptField` in `ElasticSearch.searchAfter` (Kupua endpoint only at
  present; `imageSearch` doesn't use a script field for this).

- **ES-client gzip** (F1): one-line, behaviour-transparent, reduces ES response bandwidth/heap
  ~5× across all services. **Not a latency fix on prod** (the link is already fast) — purely an
  efficiency/GC consideration. Wider blast radius (`common-lib`). Offered for their judgement.

**Do not touch:**
- `trackTotalHits=true` on page 1 (F3) — product requirement (scrubber).
- The mixed-route strangler (F6) — the contention is a dev-tunnel artefact, not a design flaw.

---

## F1 follow-up — measurements on real Grid (2026-06-27)

The F1 patch (`setCompressionEnabled(true)` via `JavaClient.fromRestClient`) was applied to a
PR branch (`mk-media-api-gzip-on`) and measured against real Grid TEST. Full data and scripts
are in [zz Archive/media-api-work/phase-3-d3-searchafter-perf-deep-dive-F1-measurements.md](../../../zz%20Archive/media-api-work/phase-3-d3-searchafter-perf-deep-dive-F1-measurements.md).

**Signal used:** Kibana `duration` field = media-api's `executeAndLog` elapsed time on the
ES round-trip (send + ES `took` + read body + parse). This is the gzip-sensitive leg. Tunnel
rate confirmed ~800 KB/s, consistent with the F1 model.

### Arena A — local dev (media-api → TEST ES over SSH tunnel)

| `length` | Response bytes raw → gzip | `duration` before | `duration` after | Speedup |
|----------|--------------------------|-------------------|-----------------|---------|
| 50 (Kahuna default) | 433 KB → 77 KB (5.6×) | 850 ms | 348 ms | **2.4×** |
| 200 (API max) | 1742 KB → 291 KB (6.0×) | 2817 ms | 868 ms | **3.2×** |

Dev win is a **tunnel artefact** — exactly as predicted.

### Arena B — TEST / prod-like (intra-VPC link)

Gold-standard comparison: both runs pre-warmed (20 throwaway requests), 100 reps, same
pinned `until` timestamp. The only variable is the patch.

| `length` | `duration` before (main) | `duration` after (patch) | Δ |
|----------|--------------------------|--------------------------|---|
| 1        | 69 ms                    | 68 ms                    | −1 ms — **identical** |
| 50       | 115 ms                   | 129.5 ms                 | +14.5 ms — noise¹ |
| 200      | 269 ms                   | 256 ms                   | −13 ms — consistent² |

¹ After-run had a cluster load burst at end of batch inflating the median; warm-state ranges
overlap (104–136 ms before vs 117–145 ms after).
² Appears in three independent after-measurements. Likely reduced heap/GC pressure (291 KB
buffer read vs 1742 KB).

**Verdict:** no latency regression on the prod-like link. Worst case +14 ms, within noise.
One unmeasured trade-off: ES + media-api CPU for compression/decompression, invisible at
TEST QPS, real but likely small at PROD QPS.

---

## Appendix — reproduction

ES `took` A/B (script field), against the active index, no app/tunnel-jitter:

```bash
# Without script field — baseline
curl -s -H "Content-Type: application/json" -d '{
  "size":200,"stored_fields":["_source"],
  "_source":{"excludes":["embedding","originalMetadata","fileMetadata"]},
  "query":{"match_all":{}}
}' "http://localhost:9200/<index>/_search" | python3 -c "import sys,json;print(json.load(sys.stdin)['took'])"

# With script field — add:
#   "script_fields":{"isPotentiallyGraphic":{"script":{
#     "source":"params['_source']?.fileMetadata?.xmp != null && params['_source']?.fileMetadata?.xmp['pur:adultContentWarning'] != null",
#     "lang":"painless"}}}
# (zsh: write the body via a single-quoted heredoc or python; bare ! triggers history expansion)
```

Wire-size A/B (compression): same query body, compare `wc -c` of the response with vs without
`-H "Accept-Encoding: gzip"`.

**Measured values (this investigation, 2026-06-14, real cluster, 200 hits, `match_all`):**

- Wire: lean 373KB→70KB (5.3×) · direct-ES 308KB→63KB (4.9×) · full-fat 1745KB→290KB (6.0×)
- ES `took`: no-script 33ms · +script +30ms · +`trackTotalHits` +28ms · sourceInclude +2ms
- Live compression A/B: ~988ms → ~486ms Home reload (`--use-media-api`)
- Effective dev-tunnel rate: ~708 bytes/ms (~690 KB/s)
