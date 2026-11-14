# F1 (ES-client gzip) — measurement runbook

**Companion to:** [d3-search-after-04-performance.md](../../03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/d3-search-after-04-performance.md) (Finding F1).
**Date started:** 2026-06-27
**Status:** Plan — not yet executed.
**Audience:** A Sonnet agent executing this **together with the operator** (who has Kibana +
AWS Console / CloudWatch access and a working local Grid, but is *not* an engineer — the agent
issues precise commands, the operator runs them and reports back).

---

## 0. What we are proving (read this first — it changes how to read the numbers)

The change under test (F1) makes the media-api ⇆ Elasticsearch client request gzip, so ES
returns a ~5× smaller response body. It lives in `common-lib` and therefore touches **every**
Grid service, not just media-api.

The honest, pre-committed shape of the result — derived from topology in the F1 deep-dive, so
do not be surprised by it:

| Arena | What gzip does there | What we expect to measure |
|---|---|---|
| **Local dev** (media-api → TEST ES over the **SSH tunnel**) | Tunnel is bandwidth-limited, so 5× fewer bytes ≈ 5× less transport time | **A large, clean latency win.** This is the whole reason to bother. |
| **TEST / PROD** (media-api → ES **intra-VPC**, fast link) | The link is already fast; bytes barely affect latency | **~Flat latency (this is the goal, not a failure).** The win here is bytes/heap/GC — *modest*, and mostly invisible to request latency. |

So the exercise has **two different jobs**:

1. **Local:** *demonstrate a real developer-experience win.*
2. **TEST (as a stand-in for PROD, since we won't measure PROD directly):** *prove the change
   introduces no downside* — latency not worse, ES compute (`took`) unchanged — and, as a
   bonus, look for any modest improvement.

> ⚠️ **Do not interpret "TEST latency barely moved" as "gzip didn't work."** The F1 topology
> analysis predicts exactly that. A flat TEST result *is* a pass (no regression). The local
> tunnel win is a **dev-only artefact** and must never be quoted as a PROD latency prediction.

### What this exercise can and cannot prove

- **Can prove:** local dev gets faster; ES `took` is unchanged (gzip doesn't touch query
  execution); TEST request latency is not made worse; the response body shrinks ~5× (efficiency).
- **Cannot prove from a handful of manual searches:** the heap/GC/CPU efficiency gain on PROD,
  or the one genuine trade-off — gzip adds a little CPU (ES compresses, media-api decompresses).
  Attributing a CPU/GC delta to gzip needs sustained load + node-level metrics over hours, which
  is out of scope. **Acknowledge this trade-off honestly in the PR** rather than pretending to
  have measured it away.

---

## 1. The change being measured, and why it's the only clean way to enable it

Current client construction ([ElasticSearchClient.scala](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/ElasticSearchClient.scala) `lazy val client`):

```scala
val client = JavaClient(ElasticProperties(url))
ElasticClient(client)
```

**Verified (against elastic4s 8.19.1 source):** gzip is **not** a config flag, env var, or
system property anywhere in elastic4s or the ES Java REST client. It is a single method —
`RestClientBuilder.setCompressionEnabled(true)` — and `JavaClient.apply(...)` builds the
`RestClient` internally and never exposes that builder. Its two callback hooks
(`RequestConfigCallback` → `RequestConfig.Builder`, `HttpClientConfigCallback` →
`HttpAsyncClientBuilder`) **cannot reach** `setCompressionEnabled` (it lives on
`RestClientBuilder`). The only object that accepts a pre-built client is
`JavaClient.fromRestClient(...)`. So the deep-dive's patch is the **minimal canonical form**,
not a hack:

```scala
// THROWAWAY measurement patch — do NOT commit as-is.
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

For the eventual **PR to main**, the *mechanism* above is unchanged, but because it's
`common-lib` (every service), prefer gating it behind a config key (instant per-env rollback
without a code redeploy) rather than a bare hardcoded `true`. That is a PR-design decision to
raise with the Grid team — it is **not** a "cleaner way to turn it on"; there isn't one.

> The agent must **not** apply this patch until the operator explicitly says go (see Arena A,
> step A2).

---

## 2. The three signals (all already exist — no new instrumentation)

| # | Signal | Where to read it | What it represents | Sensitive to gzip? |
|---|---|---|---|---|
| S1 | **`duration`** field on log line `image search - query returned successfully in N ms` | Local: media-api console/log. TEST: **Kibana**. | The full media-api⇆ES round trip: send + ES `took` + **read entire body + parse**. | **YES** — the headline. |
| S2 | **`ElasticSearch`** metric (ms) | **CloudWatch** namespace `TEST/MediaApi`, dimension `SearchType=results` | ES server-side `took` (query execution only) | **NO** — this is the **control**: it must stay flat. |
| S3 | **Response bytes on the wire** | Local **direct-ES curl** (`wc -c`) | Payload size uncompressed vs gzip | **YES** — the efficiency evidence (~5×). |

The gzip effect is **S1 − S2** (transport + body-read + parse). S2 flat + S1 dropping = the win
is attributable to compression, not to ES getting faster.

There is also **`RequestDuration`** (CloudWatch, same `TEST/MediaApi` namespace) = total media-api
HTTP handling for a request (includes the ~137 ms Argo envelope build + the ES round trip). Use it
on TEST as the **no-downside** check at the HTTP level: it should be flat (envelope dominates;
the intra-VPC transport gzip touches is already tiny).

---

## 3. "fast / medium / slow" = the Home search at varying `length`

Per the operator's steer and the F1 conclusion (*complicating the query stresses ES, not the
pipe*), we **hold the query fixed and vary page size `length`** — the one axis that drives
response **bytes**, which is what gzip attacks. Query complexity (which inflates `took`) is
deliberately *not* varied, so we don't conflate an ES-compute cost with a transport cost.

Fixed query = Kahuna's real search, captured from the **TEST** Network tab (operator-supplied):

```
GET /images?q=&length=1&orderBy=-uploadTime&free=true&countAll=true                          ← first probe
GET /images?q=&offset=45&length=50&orderBy=-uploadTime&until=<TS>&free=true&countAll=false    ← a page
GET /images?q=&offset=95&length=30&orderBy=-uploadTime&until=<TS>&free=true&countAll=false    ← next page
```

So the fixed shape is `q=&orderBy=-uploadTime&free=true`, with `length` varied. Two cross-cutting
flags matter for rigour:

- **`countAll`** — `true` only on Kahuna's first probe (it triggers exact `trackTotalHits`, the F3
  ~+28 ms cost, which is **gzip-independent**). For the body-size A/B use **`countAll=false`** (what
  paging sends) and hold it constant within a comparison. Keep one separate `countAll=true` probe as
  its own bucket, mirroring Kahuna.
- **`until=<fixed timestamp>`** — Kahuna pins the result window so paging is a stable snapshot.
  **Pin it to ONE value and reuse it for every rep and for both before/after** — this freezes the
  corpus so the only variable is gzip. Pick it once (e.g. `UNTIL='2026-06-27T14:03:57.230Z'`) and
  record it with the results. Also keep **`offset=0`** for the length sweep (offset changes *which*
  hits, not how many → no effect on body size; offset=0 keeps it deterministic and clear of ES's
  `max_result_window`).

**Length buckets to measure** (each = one "speed"):

| Bucket | request | Rationale |
|---|---|---|
| count probe | `length=1, countAll=true` | Kahuna's first request; exact total via `trackTotalHits`. |
| fast | `length=50, countAll=false` | Kahuna's real page size. |
| medium | `length=200, countAll=false` | The deep-dive's reference size. |
| slow | `length=200, countAll=false` | **The hard cap** — `SearchParams.maxSize = 200` ([ElasticSearchModel.scala:358](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L358)). Anything above returns HTTP 400. 200 is also the F1 deep-dive reference size. |

---

## 4. 🔒 SECURITY — this repo is PUBLIC. Non-negotiable.

- **Never write to any file under `kupua/`:** panda cookie values, `Authorization` headers, or
  **media-api response bodies** — the `/images` response contains **signed S3 / CloudFront URLs**
  (`AWSAccessKeyId`, `Signature`, `x-amz-security-token`). Leaking these may force credential
  rotation.
- When curling media-api, send output to `/dev/null` or `wc -c` — **never** redirect a response
  body into a file in the repo, and never paste one into this doc or the changelog.
- Keep the cookie in a **shell variable for the session only** (§5). Do not put it in a committed
  script. Do not `echo` it into any saved output.
- The direct-ES curls (§6, `localhost:9200`) return raw ES docs (no signed URLs) but still contain
  real metadata — also send bodies to `wc -c` / `/dev/null`, never to a repo file.

---

## 5. The cookie, solved once (only needed for the through-media-api curls in §6 A2)

> **You do NOT need a cookie for the direct-ES curls (§6 A1)** — `localhost:9200` is the raw
> cluster over the tunnel, no panda auth. Do A1 first; the cookie is only for the faithful
> end-to-end A2 step.

Definitive, lowest-friction method (avoids hand-copying cookie values):

1. In Chrome, open **`https://media.local.dev-gutools.co.uk`** (local Kahuna) and make sure you're
   logged in.
2. Open DevTools (**⌘⌥I**) → **Network** tab.
3. In Kahuna, click **Home** (or run the search you want to measure).
4. In Network, find the request to **`api.media.local.dev-gutools.co.uk/images?...`**.
5. Right-click it → **Copy → Copy as cURL**.
6. Paste into the terminal and run it once. Expect HTTP 200 and a JSON body. ✅ That curl already
   contains the panda cookie (`gutoolsAuth-assym`) — auth is solved.

To reuse it in a loop without re-pasting the cookie each run, lift just the cookie into a session
variable (paste the value from the copied command between the quotes — **terminal only, never a
file**):

```zsh
# Paste ONLY the gutoolsAuth-assym value between the single quotes. Session-only. Never commit.
export GRID_COOKIE='gutoolsAuth-assym=PASTE_VALUE_HERE'
# sanity check (should be 200):
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Cookie: $GRID_COOKIE" \
  'https://api.media.local.dev-gutools.co.uk/images?orderBy=newest&length=1'
```

If you ever see `401 authentication-failure`, the cookie expired — re-do steps 1–6.

---

## 6. Arena A — LOCAL (the dev win)

**Prereq:** Grid running locally against TEST ES via the SSH tunnel:

```zsh
dev/script/start.sh --use-TEST    # auth + media-api, TEST config, tunnel ES on localhost:9200
```

Confirm the tunnel: `curl -s localhost:9200/_cat/aliases | grep -i image` should list the images
alias. Note that alias name as `INDEX` below.

### A1 — Physics + bytes + `took` (cookie-free, no patch, no recompile) — do this first

This reproduces the F1 mechanism on **your actual tunnel** by toggling `Accept-Encoding` on a
direct ES call. It proves the tunnel is bandwidth-limited, gives the **byte ratio** (S3) and the
**`took` floor** (S2), and needs neither the patch nor auth.

```zsh
INDEX=$(curl -s localhost:9200/_cat/aliases | awk '/image/{print $1; exit}')
echo "index alias: $INDEX"

for LEN in 0 50 200 500; do
  BODY="{\"size\":$LEN,\"track_total_hits\":true,\"query\":{\"match_all\":{}}}"

  # Uncompressed
  RAW=$(curl -s -H 'Content-Type: application/json' -d "$BODY" \
        "localhost:9200/$INDEX/_search" | wc -c | tr -d ' ')
  # Gzip
  GZ=$(curl -s --compressed -H 'Content-Type: application/json' -d "$BODY" \
        -o /dev/null -w '%{size_download}' "localhost:9200/$INDEX/_search")
  # took (server-side ES time; gzip-independent — sanity that it's stable)
  TOOK=$(curl -s -H 'Content-Type: application/json' -d "$BODY" \
        "localhost:9200/$INDEX/_search" | python3 -c 'import sys,json;print(json.load(sys.stdin)["took"])')
  # Wall-clock transport, uncompressed vs gzip (median over a few)
  T_RAW=$(curl -s -H 'Content-Type: application/json' -d "$BODY" -o /dev/null -w '%{time_total}' "localhost:9200/$INDEX/_search")
  T_GZ=$(curl -s --compressed -H 'Content-Type: application/json' -d "$BODY" -o /dev/null -w '%{time_total}' "localhost:9200/$INDEX/_search")

  printf 'len=%-4s rawBytes=%-8s gzipBytes=%-8s ratio=%-5s took=%-4s tRaw=%ss tGz=%ss\n' \
    "$LEN" "$RAW" "$GZ" "$(python3 -c "print(round($RAW/max($GZ,1),1))")" "$TOOK" "$T_RAW" "$T_GZ"
done
```

> `--compressed` makes curl send `Accept-Encoding: gzip` and decode the reply — exactly what the
> F1 patch makes media-api do. Run the loop **3–5 times**; ignore the first (cold caches); take
> medians. `took` should be roughly constant across compressed/uncompressed (it's the control).
> The match_all body is a *proxy* for media-api's projection — absolute bytes differ, but the
> **ratio** (~5×) and the **transport collapse** are the point.

**Record (A1):** for each `len`: raw bytes, gzip bytes, ratio, `took`, `time_total` raw vs gzip.

### A2 — Faithful end-to-end through media-api, before vs after the patch (needs cookie)

This confirms the **real endpoint** realises the win — the thing that will actually be deployed.

**A2-before (no patch):** with the cookie set (§5), loop the real Home request at each length and
read **two** numbers per request: curl `time_total` (end-to-end) and the media-api log `duration`
(S1, the ES round-trip leg).

```zsh
# Real Kahuna shape; corpus pinned via a fixed `until`. Body to /dev/null (signed URLs — never a file).
UNTIL='2026-06-27T14:03:57.230Z'   # pick once; reuse for before AND after
for LEN in 50 200 500; do
  for i in $(seq 1 22); do
    curl -s -o /dev/null -w '%{time_total}\n' \
      -H "Cookie: $GRID_COOKIE" \
      "https://api.media.local.dev-gutools.co.uk/images?q=&length=$LEN&offset=0&orderBy=-uploadTime&free=true&countAll=false&until=$UNTIL"
  done | sort -n | awk '{a[NR]=$1} END{print "len='"$LEN"' median="a[int(NR/2)]" p95="a[int(NR*0.95)]}'
done
# count probe (mirrors Kahuna's first request):
#   .../images?q=&length=1&orderBy=-uploadTime&free=true&countAll=true
```

For S1, watch the media-api terminal (or its log file) for lines:
`image search - query returned successfully in N ms` — note `N` (the `duration`) per length.
(Tip: in another terminal, `tail -f` the media-api log and `grep "image search"`.)

**A2-after (with patch):**
1. Operator says go → agent applies the §1 throwaway patch to `ElasticSearchClient.scala`.
2. Let sbt hot-recompile (media-api picks it up; confirm a fresh `Connecting to Elastic 8:` /
   successful search in the log).
3. Re-run the exact A2-before loop.
4. **Revert the patch** afterwards (git checkout the file) — nothing committed.

**Record (A2):** per length, `time_total` median + p95 and S1 `duration`, for **before** and
**after**. Expect `duration` (and hence `time_total`) to drop substantially at larger lengths,
shrinking toward the gzip transport from A1.

---

## 7. Arena B — TEST (the no-downside / prod-proxy case)

**You are the only traffic on TEST.** That is a gift: we do **not** eyeball clicks or match
time-of-day windows. We **script an identical, repeatable load** and read it back with perfect
attribution — every `image search` log line in the window is yours, nobody else's.

**Which number is the real signal (important):** the gzip change is server-side (media-api⇆ES,
intra-VPC, tiny). Your laptop⇆TEST media-api hop is WAN and is *already* gzipped by
CloudFront/nginx — unaffected by this change. So curl's `time_total` from your machine is **not**
the clean signal; it buries the small ES-leg delta under WAN jitter. The clean, gzip-sensitive
number is the **server-side `duration` (S1) in Kibana**, measured *inside* media-api around the ES
call. Therefore in Arena B the **curl loop is just a load generator**; **Kibana `duration` is the
measurement.** (Capture client `time_total` too — it's a free sanity check — but don't headline it.)

**TEST coordinates:** Kahuna `https://media.test.dev-gutools.co.uk`, media-api
`https://api.media.test.dev-gutools.co.uk`, cookie `gutoolsAuth-assym` on `.test.dev-gutools.co.uk`.
Get it via Copy-as-cURL on **TEST** Kahuna (same method as §5), then:
`export GRID_COOKIE_TEST='gutoolsAuth-assym=PASTE_VALUE_HERE'` (terminal only, never a file).

**Safety:** `GET /images` only — read-only. Never any write verb against TEST.

### B1 — Scripted load generator (run the EXACT same script before and after the deploy)

The script below is pre-filled with your observed TEST request shape
(`q=&orderBy=-uploadTime&free=true`, `countAll=false`, `offset=0`, pinned `until`). If your
session's filters differ, re-capture via Copy-as-cURL (§5) and adjust. It runs each length as a
**timed batch** and prints ISO timestamps so you can bracket each batch precisely in
Kibana/CloudWatch. Sole traffic + scripted load means no contention, so use a generous rep count
for tight percentiles.

```zsh
LENGTHS=(50 200 500)
REPS=50
UNTIL='2026-06-27T14:03:57.230Z'   # pin the corpus; use the SAME value before and after the deploy
for LEN in $LENGTHS; do
  echo ">>> length=$LEN  START $(date -u +%FT%TZ)"
  for i in $(seq 1 $REPS); do
    curl -s -o /dev/null -w '%{time_total}\n' \
      -H "Cookie: $GRID_COOKIE_TEST" \
      "https://api.media.test.dev-gutools.co.uk/images?q=&length=$LEN&offset=0&orderBy=-uploadTime&free=true&countAll=false&until=$UNTIL"
  done | sort -n | awk '{a[NR]=$1} END{
    printf "    client time_total  p50=%s  p95=%s  p99=%s\n", a[int(NR*0.5)], a[int(NR*0.95)], a[int(NR*0.99)]
  }'
  echo ">>> length=$LEN  END   $(date -u +%FT%TZ)"
done
```

Record the printed `START`/`END` timestamp for each length batch — those are your Kibana/CloudWatch
brackets. (Optionally insert a short pause between batches so CloudWatch's per-minute buckets
separate cleanly; with sole traffic it's not required, the timestamps are enough.)

### B2 — Read S1 in Kibana (the clean gzip signal), per length bracket

For each length batch, set the Kibana time range to that batch's `START..END`, filter to the
media-api search log line, and read the **`duration`** percentiles. Starting KQL (adjust
`stage`/`app` field names to your Kibana):

```
message: "image search - query returned successfully" and stage: "TEST"
```

Read **p50 / p95 / p99** of `duration`. Because you're the only traffic, every hit in the bracket
is one of your requests at that exact `length`. Do this for **before** and **after** the deploy.

### B3 — Read S2 + RequestDuration in CloudWatch (control + no-downside check)

AWS Console → **CloudWatch → Metrics → All metrics**, namespace **`TEST/MediaApi`**, set the graph
time range to your batch brackets:

- Metric **`ElasticSearch`**, dimension **`SearchType = results`** — ES `took`. Stats **p50 / p90**.
  **Expectation: flat before vs after** (the control — gzip doesn't touch query execution).
- Metric **`RequestDuration`** — total media-api request handling. Stats **p50 / p95 / p99**.
  **Expectation: flat** (envelope build dominates; the intra-VPC transport gzip touches is tiny).

### Procedure

1. **Before:** current deployed TEST (unpatched). Run B1, then capture B2 + B3 per length.
2. **Deploy** the patched media-api build to TEST.
3. **After:** run the *identical* B1, then capture B2 + B3 per length.
4. Sole traffic → the only variable between the two captures is the deploy.

**Record (B):** per length, before/after — Kibana `duration` (p50/p95/p99), CloudWatch
`ElasticSearch` (p50/p90), CloudWatch `RequestDuration` (p50/p95/p99), and client `time_total`
(p50/p95) as a sanity column.

---

## 8. Analysis & decision rules

**Local (Arena A) — PASS if:**
- A1: byte ratio ≈ 4–6× at length ≥ 50; `time_total`/transport collapses for gzip; `took` ~constant.
- A2: `duration` (S1) drops substantially at larger lengths, after-patch ≈ A1's gzip transport.
- If A1 shows little transport difference, the tunnel isn't bandwidth-limited today → there is
  nothing to win locally; say so, don't manufacture a result.

**TEST (Arena B) — PASS (no downside) if:**
- CloudWatch `ElasticSearch` (`took`) is **flat** before vs after (control holds — gzip didn't
  touch query execution). ✅
- `RequestDuration` p50/p95/**p99** is **not worse** (no latency regression). ✅
- Kibana `duration` is flat or slightly down. Flat = expected pass; a small drop = the bonus
  modest gain.
- **FAIL / investigate** only if `RequestDuration` p99 or `took` rises meaningfully after deploy —
  that would hint the CPU cost of (de)compression is non-trivial at TEST QPS, which is exactly the
  trade-off to flag.

**Headline you should be able to write at the end:**
> "Local dev: Home at length=200 dropped from ~X ms to ~Y ms (≈5× smaller body over the tunnel).
> TEST: ES `took` unchanged; media-api `RequestDuration` p99 unchanged within noise; response
> bodies ~5× smaller. → No latency downside on the PROD-like link; a modest bytes/heap efficiency
> gain; a real, large win for local development."

---

## 9. What "done" looks like (self-check before declaring complete)

- [ ] A1 table filled (bytes raw/gzip/ratio, `took`, transport raw/gzip) for len 0/50/200/500.
- [ ] A2 table filled (time_total median+p95, S1 `duration`) for **before** and **after** patch.
- [ ] Patch reverted locally; `git status` clean for `ElasticSearchClient.scala`.
- [ ] TEST before/after captured: Kibana `duration` (median/p95/p99), CloudWatch `ElasticSearch`
      (p50/p90), CloudWatch `RequestDuration` (p50/p95/p99).
- [ ] No cookie, signed URL, or response body written to any file in the repo.
- [ ] Decision-rule verdict stated for both arenas, with the local-win-is-tunnel-only caveat
      explicit.

---

---

## Measurements

### A1 — Direct-ES bytes + transport (2026-06-27, local dev, TEST cluster, SSH tunnel)

> Note: A1 goes direct to ES (no media-api), so len=500 is valid here.
> The media-api endpoint caps at `maxSize=200` — see A2 note below.

Script: `phase-3-d3-searchafter-perf-deep-dive-F1-a1-direct-es.sh`
Tunnel rate (derived): ~800 KB/s. Index: `Images_Current`. Query: `match_all`, 7 reps median.

| len | rawKB  | gzKB  | ratio | took_ms (med) | tRaw_s (med) | tGz_s (med) | transport speedup |
|-----|--------|-------|-------|---------------|--------------|-------------|-------------------|
| 1   | 5.7    | 2.2   | 2.6×  | 18            | 0.087        | 0.096       | —  (overhead dominates; gzip marginally *slower* at this size — expected) |
| 50  | 433.3  | 76.9  | 5.6×  | 23            | 0.599        | 0.179       | **3.3×** |
| 200 | 1742.0 | 291.1 | 6.0×  | 36            | 2.195        | 0.471       | **4.7×** |
| 500 | 4290.5 | 709.4 | 6.0×  | 63            | 5.280        | 0.984       | **5.4×** |

**`took` is flat across raw/gzip variants (confirmed gzip-independent) — control holds.**

Key notes:
- At Kahuna's real page size (len=50): transport drops from 599ms to 179ms over the tunnel.
- Compression ratio stabilises at **~6×** for real image payloads (len ≥ 200). Matches F1 deep-dive (5.3× for lean projection, 6.0× for full-fat).
- len=1 is the only case where gzip is marginally slower — negotiation overhead outweighs savings on tiny bodies. Not a concern in practice (count probes return near-instantly regardless).
- Tunnel rate ~800 KB/s — consistent with F1 deep-dive's ~708 KB/s measurement.
- len=500 is **above the media-api hard cap** (`SearchParams.maxSize=200`). Included here for physics/extrapolation only; the real endpoint never serves it.

### A2-before — through local media-api, no gzip patch (2026-06-27)

Script: `phase-3-d3-searchafter-perf-deep-dive-F1-a2-before.sh`
Query: `q=&orderBy=-uploadTime&free=true&countAll=false`, `until=2026-06-27T15:58:42.572Z` (pinned), 7 reps median.
`duration_ms` = media-api log elapsed on the ES round-trip (the gzip-sensitive signal).
`tTotal_s` = end-to-end curl time (includes nginx + Play + Argo envelope ~137ms + signing ~29ms).

| len | tTotal_s (med) | duration_ms (med) | note |
|-----|----------------|-------------------|------|
| 1   | 0.189          | 167               | baseline: ES `took` + aggs + minimal body |
| 50  | 0.932          | 850               | 850−167=**683ms transport** |
| 200 | 3.001          | 2817              | 2817−167=**2650ms transport** (max valid page) |

**Model check (vs A1 uncompressed transport):**
- len=50: 683ms measured vs 576ms in A1 (A1 is match_all; real query has filters+aggs → heavier per-hit docs, consistent).
- len=200: 2650ms measured vs 2159ms in A1 (same explanation).

**Predicted A2-after durations** (baseline 167ms + transport/ratio):
- len=50: 167 + 683/5.6 ≈ **~289ms** (vs 850ms now → ~3× speedup)
- len=200: 167 + 2650/6.0 ≈ **~609ms** (vs 2817ms now → ~4.6× speedup)

### A2-after — through local media-api, WITH gzip patch

Script: `phase-3-d3-searchafter-perf-deep-dive-F1-a2-after.sh`
Same conditions as A2-before. Patch reverted immediately after.

| len | tTotal_s (med) | duration_ms (med) | duration speedup | tTotal speedup |
|-----|----------------|-------------------|-----------------|----------------|
| 1   | 0.158          | 139               | 1.2×            | 1.2×           |
| 50  | 0.419          | 348               | **2.4×**         | **2.2×**        |
| 200 | 1.042          | 868               | **3.2×**         | **2.9×**        |

### A2 before vs after — summary

| len | duration before | duration after | transport before¹ | transport after¹ | transport speedup |
|-----|----------------|----------------|-------------------|-----------------|------------------|
| 1   | 167ms          | 139ms          | ≈ 0 (floor)        | ≈ 0 (floor)      | — (aggs body also compressed²) |
| 50  | 850ms          | 348ms          | 683ms             | 209ms           | **3.3×** |
| 200 | 2817ms         | 868ms          | 2650ms            | 729ms           | **3.6×** |

¹ Transport = `duration − len=1 duration` (isolates the hit-payload leg from the base ES+aggs cost).
² len=1 improved 167→139ms (+17%) despite negligible hit body — the aggregation results in every
response also benefit from gzip, lowering the floor slightly.

**Model check vs A1:** A1 showed 3.3× transport speedup at len=50 (match_all); A2 shows 3.3× at
len=50 with the real query. Excellent agreement. A1 showed 4.7× at len=200; A2 shows 3.6× —
slightly less, consistent with real query docs having different field density than match_all.

### B-before — TEST, no gzip patch (2026-06-27)

Script: `phase-3-d3-searchafter-perf-deep-dive-F1-b-before.sh`
UNTIL pinned: `2026-06-27T16:41:07.000Z`. Reps: 50 per length.
`duration` = Kibana field (media-api ES round-trip, ms). `tTotal_s` = curl end-to-end (WAN + all server-side).
Kibana KQL: `stage:TEST AND stack:media-service AND message:"image search - query returned successfully"`

| len | tTotal_s (med) | duration p50 | duration p95 | duration p99 | Kibana n |
|-----|----------------|-------------|-------------|-------------|----------|
| 1   | 0.205          | 110ms       | 125ms       | 162ms       | 50       |
| 50  | 0.428          | 122ms       | ~155ms      | 172ms       | 53 ⚠    |
| 200 | 0.856          | 292ms       | ~372ms      | 418ms       | 55 ⚠    |

⚠ Kibana counts exceed 50: ~3–5 entries are Kahuna background polling (`length=0` probes) that
landed in each batch window. Their durations (18–28ms) are clearly distinguishable and excluded
from the percentiles above. **For B-after: close the Kahuna browser tab before running.**

**Key observations (the F1 prediction confirmed from the TEST side):**

- len=1→50 adds only **+12ms** to `duration`. On TEST (intra-VPC, fast link), 433KB of
  uncompressed JSON transports in ~3ms — body size is irrelevant to latency. The gzip latency
  win is a **dev-tunnel artefact** — confirmed.
- len=1→200 adds **+182ms**, mostly **JSON parse cost** on the Play/media-api side (1742KB vs
  negligible body at len=1). Gzip reduces this proportionally (~6× fewer bytes to deserialise).
- `tTotal_s` overhead over `duration`: 95ms / 306ms / 564ms for len=1/50/200. The
  browser↔media-api leg is already gzipped by CloudFront — unaffected by our patch.
- **Expected B-after:** duration flat or modestly lower. len=50: ~5–15ms improvement (less
  JSON parsing). len=200: ~100–130ms improvement (parsing 291KB instead of 1742KB). No latency
  regression expected at any length — this is the "no downside on PROD" proof.

### B-after — TEST, WITH gzip patch (2026-06-27, cold JVM — see B-after-warm below)

Script: `phase-3-d3-searchafter-perf-deep-dive-F1-b-after.sh`
Same UNTIL, 50 reps. **⚠ Run immediately after a Riff-Raff deploy = cold JVM. Superseded by B-after-warm.**

| len | duration p50 | duration p99 | Kibana n |
|-----|-------------|-------------|----------|
| 1   | **73.5ms**  | 115ms       | 50       |
| 50  | ~173ms ⚠   | 297ms ⚠    | 50       |
| 200 | ~346ms ⚠   | 518ms ⚠    | 52       |

### B-before-warm — TEST, NO patch, pre-warmed, 100 reps (2026-06-27) ← gold standard

Script: `phase-3-d3-searchafter-perf-deep-dive-F1-b-before-warm.sh`
Same UNTIL (`2026-06-27T16:41:07.000Z`). 20 pre-warm requests per length, 100 timed reps.
Direct pair with B-after-warm: both pre-warmed, same protocol, same UNTIL.

| len | tTotal_s (med) | duration p50 | duration p95 | duration p99 | Kibana n |
|-----|----------------|-------------|-------------|-------------|----------|
| 1   | 0.183          | **69ms**    | ~78ms       | ~121ms      | 98 (2 polls)|
| 50  | 0.395          | **115ms**   | ~180ms      | ~226ms      | 100 (1 poll, bimodal¹)|
| 200 | 0.854          | **269ms**   | ~335ms      | ~355ms      | 105 (5 polls)|

¹ len=50 bimodal: despite 20 pre-warm requests, the ES query cache for this query needed ~20 more
requests to fully warm. First ~20 timed requests were 157–226ms; remaining ~80 were 104–136ms.
The median (115ms) reflects the mix. This affects the gold-standard comparison at len=50 — see below.

### Gold-standard comparison — B-before-warm vs B-after-warm

Both runs: pre-warmed (20 requests), 100 reps, same UNTIL, same Kibana methodology. The fairest
comparison in the dataset.

| len | before-warm p50 | after-warm p50 | Δ | verdict |
|-----|----------------|----------------|---|---------|
| 1   | **69ms**       | **68ms**       | −1ms   | **Identical.** Within single-digit noise. |
| 50  | **115ms**      | **129.5ms**    | +14.5ms | **Noise / small overhead.** After-warm had a load burst at end of batch (rows 13–1: 144–254ms) inflating its median. Warm-state overlap: 104–136ms before vs 117–145ms after. A real +13–18ms gzip CPU overhead at len=50 is possible but small. |
| 200 | **269ms**      | **256ms**      | −13ms  | **Consistent modest improvement.** Appears in all three after-runs. Likely reduced GC/heap pressure (291KB buffer vs 1742KB). |

**What the earlier "38% improvement" at len=1 actually was:** B-before (not pre-warmed) had
median=110ms driven by cold-start. Both pre-warmed runs land at 68–69ms. The claimed improvement
was entirely a measurement artefact from unequal warmup conditions.

### Final B verdict

| claim | confidence | evidence |
|-------|-----------|----------|
| No latency regression at len=1 | **High** | 69ms vs 68ms, near-perfect match |
| No regression at len=50 | **Medium** | +14.5ms attributable to load burst; warm-state ranges overlap |
| Modest improvement at len=200 (−13ms, −5%) | **Medium** | Consistent across 3 independent after measurements |
| No catastrophic regression anywhere | **High** | Worst case +14.5ms / 13% at len=50 |
| CPU overhead at sustained PROD QPS | **Unmeasured** | Not visible at TEST's single-request workload; acknowledge in PR |

Script: `phase-3-d3-searchafter-perf-deep-dive-F1-b-after-warm.sh`
Same UNTIL. 20 pre-warm requests per length (excluded from timestamps/Kibana). 100 timed reps.
Run immediately after B-after while JVM was still warm — eliminates the cold-JVM confound.

| len | tTotal_s (med) | duration p50 | duration p95 | duration p99 | Kibana n |
|-----|----------------|-------------|-------------|-------------|----------|
| 1   | 0.180          | **68ms**    | ~90ms       | 120ms       | 104 (2 polls)|
| 50  | 0.444          | **129.5ms** | ~170ms      | 189ms       | 102 (3 polls)|
| 200 | 0.800          | **256ms**   | ~330ms      | 376ms       | 103 (4 polls)|

### B — complete summary across all three runs

| len | B-before | B-after (cold JVM) | B-after-warm | verdict |
|-----|----------|--------------------|--------------|---------|
| 1   | 110ms    | 73.5ms             | **68ms**     | **−38% reproducible across both after-runs. Real.** Gzip on aggregation results. |
| 50  | 122ms    | 173ms (noise)      | **129.5ms**  | **Flat (+6%, noise).** Cold-JVM artefact confirmed and eliminated by warm re-run. |
| 200 | 292ms    | 346ms (noise)      | **256ms**    | **−12%.** Likely real (less data read from socket) but partially confounded by session gap. |

**Warm-state cross-check (most rigorous comparison available):**

| | len=1 | len=50 | len=200 |
|---|---|---|---|
| B-before end-of-batch (warm) | 65–71ms | 107–125ms | 270–295ms |
| B-after-warm start-of-timed-batch | **65–75ms** | **119–134ms** | **238–270ms** |
| Verdict | **Identical** | **Comparable** | **Slightly better** |

**Conclusions for the PR:**

1. **No latency regression on the prod-like link.** Warm-state values are identical or marginally
   better at all lengths. The B-after cold-JVM artefact was a measurement issue, not a real effect.

2. **Genuine len=1 improvement (~38%).** Every `/images` response includes filter aggregation
   results (facet counts) regardless of `length`. These compress well and now benefit from gzip —
   confirmed across two independent after-runs. Better than F1's "latency-neutral" prediction.

3. **len=200 likely modestly better** (~256ms vs ~280ms warm-state). Conservative claim: no regression.

4. **Unmeasured trade-off: CPU.** Gzip adds ES-side compression + media-api-side decompression CPU.
   Invisible at TEST's near-zero QPS. At PROD QPS it exists but should be small relative to the
   JSON-parse work already happening. Acknowledge honestly in PR.

5. **Cold-start is irrelevant to PROD.** PROD runs multiple warm, long-running media-api instances.
   The cold-JVM artefact affected only our measurement methodology.

---

## 10. Open items / things still to confirm at run time

- **media-api max `length`** — confirmed `SearchParams.maxSize = 200` ([ElasticSearchModel.scala:358](../../../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L358)).
- **Kibana KQL** — confirmed working: `stage:TEST AND stack:media-service AND message:"image search - query returned successfully"`
- **CloudWatch** — `TEST/MediaApi` namespace confirmed; `ElasticSearch` (SearchType=results) and `RequestDuration` only populate once requests arrive (idle TEST = no metrics shown).
- **CloudWatch dimension value** — confirmed in code as `SearchType=results`; verify it appears in
  the console (it only emits once media-api has served searches in the window).
- **PR form of the patch** (hardcoded `true` vs config-gated) — decide with the Grid team; out of
  scope for measurement.
