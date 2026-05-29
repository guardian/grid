# Metrics Refresh — Perf Harness Audit & Media-API Migration Readiness

**Date:** 2026-05-29  
**Purpose:** Assess what the e2e-perf harness measures, what it misses, and what
instrumentation to add before the staged media-api migration begins.

---

## Action Plan — Weekend vs Monday

### Build this weekend (pure kupua, no infra, no sign-off needed)

| # | What | Where | Effort | Outcome |
|---|------|-------|--------|---------|
| 1 | ✅ **Harvest store timings into e2e-perf** | `e2e-perf/perceived-short.spec.ts` | Small | Harness logs `took`, `seekTime`, `aggTook` alongside perceived metrics. Layer-split for free. |
| 2 | ✅ **Add `fetchDuration` at DAL public boundary** | `src/dal/es-adapter.ts` public methods | Medium | Each method emits `{ name, fetchDuration, took }`. Survives migration. Enables `fetchDuration - took = network overhead`. |
| 3 | ✅ **Blue dot enhancement** | `src/components/SearchBar.tsx` | Small | Show `fetchDuration` alongside `took` (e.g. "42ms / 310ms"). Instant manual diagnostic. |
| 4 | ✅ **RTT probe in harness** | `e2e-perf/run-audit.mjs` | Small | 5 pings before test, record `baseline_rtt_ms`. Annotate or normalise runs. |
| 5 | ✅ **Harvest seek `performance.measure` entries** | `e2e-perf/perceived-short.spec.ts` | Small | Sub-seek breakdown (forward/backward/set/paint) without any app changes. |
| 6 | ✅ **Migrate per-image render timing from experiments into P14** | `e2e-perf/perf.spec.ts`, `run-audit.mjs`, `audit-graphs.html` | Medium | P14a–d now measures per-image render success/failure, landing image render+network timing, prefetch hit detection. Emitted to `audit-log.json` and graphed on dashboard. |

All of the above are kupua-only. No Grid infra, no Scala, no shared libs, no deploy.

### Ask engineering on Monday

| Topic | Question | Why it matters |
|-------|----------|----------------|
| **Server-Timing** | Can we add `Server-Timing: db;dur=X` to media-api responses? Touches `common-lib` (ElasticSearchExecutions) + `rest-lib` (CORS). ~50 lines, 2-3 files. | Gives the browser per-request backend timing for free. The measurement already exists (Stopwatch) — we just need it in a header. |
| **CORS exposure** | Specifically: adding `Server-Timing` to `Access-Control-Expose-Headers` in GridComponents.scala. | Without this, browser hides the header from JS. One-line change but affects all Grid services. |
| **CloudFront / ALB** | In production, do CF/ALB strip non-standard response headers? | Determines whether Server-Timing works in PROD or only in TEST/dev. |
| **Telemetry pipeline** | Does the `telemetryUri` (used by `@guardian/user-telemetry-client`) support numeric aggregation (p50/p95)? Or only event counts? | If yes → kupua can beacon timing to Grafana via existing pipeline. If no → need a different path. |
| **Sentry Performance** | Is the Sentry Performance tier available and budgeted? | If yes → enables RUM (Web Vitals, fetch waterfalls) with zero new infra. |
| **media-api modification plan** | Timeline / staging for media-api changes? | Determines when Server-Timing and per-endpoint tags become relevant. |

---

*Sections below are the full analysis supporting the decisions above.*

---

## Section A — What IS Measured Today

### 1. Browser Rendering / Jank

Collected in `e2e-perf/perf.spec.ts` using browser-level observers injected after
navigation:

| Metric | Method | Location |
|--------|--------|----------|
| CLS | `PerformanceObserver({ type: "layout-shift" })` | perf.spec.ts ~L156 |
| LoAF (Long Animation Frames) | `PerformanceObserver({ type: "long-animation-frame" })` | perf.spec.ts ~L191 |
| Frame timing / jank | Custom `requestAnimationFrame` loop measuring inter-frame delta | perf.spec.ts ~L225 |
| DOM Churn | `MutationObserver` on `document.body` counting add/remove/attr | perf.spec.ts ~L248 |
| Blank Flashes | `IntersectionObserver` + `MutationObserver` on virtualizer rows | perf.spec.ts ~L330 |

### 2. Perceived Latency

Emitted by the app via `src/lib/perceived-trace.ts`. Harvested by
`e2e-perf/perceived-short.spec.ts` (~L104) and the long-journey equivalent.

| Metric | Definition |
|--------|-----------|
| dt_ack | User action → first state change / loading indicator |
| dt_status | User action → spinner or status banner visible |
| dt_first_pixel | User action → first real result row rendered |
| dt_settled | User action → loading cleared, UI stable |
| status_total | Total wall-time spent displaying status affordances |

### 3. Network

Limited. `perf.spec.ts` (~L415) uses `PerformanceObserver({ type: "resource" })` filtered
to entries containing `/es/`. Captures per-request `transferSize`, `duration` (full
round-trip from browser), and `startTime`. No decomposition into DNS / TCP / TLS /
server-processing / content-transfer.

### 4. Cold vs Warm

Partial — only PP9 (warm) vs PP10 (cold) explicitly distinguish. Most tests run fresh
Playwright contexts so cache is empty, but "warm Vite module graph" vs "cold" is not
controlled.

**Plain language:** The system is excellent at catching UI stutter (jank) and measuring
how long it takes for content to appear after a click. It cannot explain *why* something
was slow.

---

## Section A+ — The Blue Dot: In-App Timing Display

The SearchBar already shows a live timing readout next to a pulsating blue dot
(visible at `lg` breakpoint and above). These numbers are computed inside the app
stores and displayed in `src/components/SearchBar.tsx:223-241`.

### What it shows

| Metric | Source | What it means |
|--------|--------|---------------|
| **`took`** (e.g. "42ms") | `search-store.ts:200` ← `es-adapter.ts:749` | The ES `took` field from the last primary search response. Pure ES execution time — excludes network, proxy, JSON parsing. |
| **`seekTime`** (e.g. "/ 1.2s") | `search-store.ts:202` ← `search-store.ts:3592` | Wall-clock `Date.now()` delta from seek start to seek state-write. Includes ALL ES round-trips in a seek (forward + backward + position-map + fallback). |
| **`aggTook`** (e.g. "/ 18ms") | `search-store.ts:352` ← `search-store.ts:3867` | ES `took` for the filter-aggregation query (separate fetch). |
| **`rangeWalkTime`** (e.g. "/ 850ms") | `selection-store.ts:377` ← `useRangeSelection.ts:271` | Wall-clock delta of the range-selection server walk (`getIdRange`). Includes ES + network + retry. |

### How they're computed

- **`took` / `aggTook`**: Extracted from `result.took` in the ES JSON response body.
  This is the number ES itself reports for query execution (milliseconds). It does
  NOT include network RTT, Vite proxy overhead, or JSON.parse time on the client.
  Emitted by `es-adapter.ts` in every search/agg return shape (`dal/types.ts:89-90`).

- **`seekTime`**: `Date.now()` captured at `search-store.ts:2546` (seek entry) and
  subtracted at `search-store.ts:3592` (post-set). This IS wall-clock — includes
  multiple ES fetches, network, JSON parse, `scheduler.yield()`, and the Zustand
  `set()` call. But it does NOT include React render or paint.

- **`rangeWalkTime`**: Same pattern — `Date.now()` at `useRangeSelection.ts:221`,
  subtracted at line 271 after `getIdRange` returns. Wall-clock of the server walk
  only.

### The blue dot itself

The `●` character pulses (`animate-pulse`) whenever `loading || aggLoading ||
isReconciling || isRangeWalking` is true for ≥150ms (`SearchBar.tsx:41-50`).
It provides at-a-glance "the app is working" feedback. Not captured by e2e-perf.

### What the in-app display could benefit from

1. **Showing wall-clock alongside ES `took` for the primary search.** Today you see
   `42ms` (ES time) but not how long the total fetch took (network + proxy + parse).
   Adding a `fetchDuration` (wrap the fetch with `Date.now()` before/after in
   `esRequest`) would let you eyeball "ES said 42ms but the fetch took 310ms →
   268ms was network/proxy." This is the single most diagnostic addition for the
   migration — if media-api adds 200ms overhead, `took` stays the same but
   `fetchDuration` balloons.

2. **Showing per-query breakdown during seek.** `seekTime` currently lumps all round-
   trips together. During a seek, there are 2-4 sequential ES calls (forward, backward,
   positionMap, sometimes fallback). Emitting individual timings per sub-call to a
   `seekBreakdown` array (even just for DevTools, not displayed) would help diagnose
   "which call in the seek chain got slow."

3. **Persisting a short circular buffer of recent timings.** Right now, each metric
   is overwritten on the next operation. A ring buffer of the last 20 values (with
   timestamps) would let a developer scan: "searches have been taking 300-400ms today
   vs 50-80ms yesterday" without needing the perf harness.

4. **Visual warning thresholds.** Color-code the display: green < 100ms, amber
   100-500ms, red > 500ms. Gives instant "something is wrong" signal during
   manual testing without opening DevTools.

### What e2e-perf can reuse from this

1. **ES `took` is already surfaced in the store.** The harness can read it via
   `page.evaluate(() => window.__ZUSTAND_STORES__?.search?.getState()?.took)` or
   by exposing it on `window` (a one-line debug hook). No app code change needed
   beyond a tiny test-only export. This gives per-search ES cost in the perf log
   for free.

2. **`seekTime` is already wall-clock of the whole seek.** The harness currently
   doesn't capture this — it only sees the perceived trace markers. But `seekTime`
   gives the "data layer cost" portion that perceived trace's `dt_settled` also
   includes render time for. Subtracting: `dt_settled - seekTime ≈ render cost`.
   That's a layer-split the harness cannot currently produce.

3. **`aggTook` separates aggregation cost from search cost.** When the harness
   measures PP5 (filter-toggle), any regression could be in the agg query or in
   rendering the facets. Reading `aggTook` from the store isolates the ES component.

4. **`rangeWalkTime` covers a code path the harness doesn't test yet.** No perf
   spec currently exercises shift-click range selection. But when it does, the store
   already has the wall-clock number ready to read.

5. **The `performance.mark` / `performance.measure` calls in the seek path**
   (`seek-start`, `seek-forward-done`, `seek-backward-done`, `seek-set-done`,
   `seek-painted`) are already emitted (`search-store.ts:2551-2556`). The harness
   could harvest these via `page.evaluate(() => performance.getEntriesByType('measure'))`
   to get sub-seek breakdown without any app changes.

### Summary

The app already has per-query ES timing and per-operation wall-clock timing that the
perf harness completely ignores. Before building new instrumentation, **the cheapest
win is to have e2e-perf read what the app already knows** — particularly `took`,
`seekTime`, and the seek `performance.measure` entries. This alone would give the
harness layer-attribution (ES vs network vs render) at near-zero implementation cost.

---

## Section B — What the Perf Harness Does NOT Capture

| Layer | Status | Impact on Migration |
|-------|--------|---------------------|
| ES `took` time (query execution cost) | NOT MEASURED | Cannot distinguish "ES slow" from "network slow" |
| Network RTT baseline (probe at run start) | NOT MEASURED | Cannot discard runs polluted by bad network |
| Per-endpoint timing with query name | NOT MEASURED | Cannot say "the totals query got +200ms" |
| Proxy hop (Vite → tunnel → ES or media-api) | NOT MEASURED | Cannot isolate proxy overhead |
| `Server-Timing` headers from upstream | NOT MEASURED (upstream doesn't emit them yet) | Will be critical once media-api is the data layer |
| React render counts / component cost | NOT MEASURED | Cannot isolate "parse+render took longer" |
| JS execution (parse, hydrate) | NOT MEASURED (LoAF partial) | Cannot catch bundle-size regressions |
| Memory / heap growth | NOT MEASURED | Cannot catch leaks from data-layer change |
| Bundle size delta per run | NOT MEASURED | Not correlated with perf runs |

**Plain language:** The biggest blind spot is *layer attribution*. When a number moves,
the dashboard cannot say whether ES, the network, or the browser was responsible. This
is exactly what will break you during a staged migration.

---

## Section C — Results Storage & Comparison

### Storage

`run-audit.mjs` writes to:
- `e2e-perf/results/audit-log.json` — machine-readable append-only source of truth
- `e2e-perf/results/audit-log.js` — same data wrapped in `window.__AUDIT_LOG__` for
  the HTML dashboard to load from the filesystem
- `e2e-perf/results/audit-log.md` — human-readable summary of the last run
- Equivalent `perceived-log.*` files for perceived metrics

### Comparison

**No automated comparison engine.** Comparison is visual — a human squints at sparklines.
The "baseline" is whatever the previous points look like.

### HTML Dashboards

- `audit-graphs.html` — sparklines of jank metrics per test ID
- `perceived-graphs.html` — sparklines of perceived phases per action

**Why they are not actionable:**

1. **Aggregate-only.** You see a line trending up. You can't click through to see what
   code changed between the two points.
2. **No layer attribution.** A bar showing "settled = 2s" doesn't decompose into
   ES / network / parsing / render.
3. **No before/after view.** For a staged migration you want two columns (Baseline |
   Candidate) with a delta and a red/green flag — not 50 runs in chronological order.

**Plain language:** The dashboards are history books for developers, not decision tools
for a project manager. They show *that* something is different but not *what* layer
caused it or *whether* the regression matters.

---

## Section D — Reproducibility & Noise Control

| Control | Status |
|---------|--------|
| Statistical aggregation | Median + p95 across N runs (configurable `--runs N`) |
| Viewport | Pinned: 1987×1110, DPR 2 |
| Browser state | Fresh Playwright context per run (clean cache) |
| CPU / Network throttling | NONE — full machine speed |
| Background process check | NONE |
| RTT normalisation | NONE |

**Plain language:** The test controls browser-side variables well (same window size, clean
cache, statistical median). It does NOT control or even measure network conditions, so
two identical runs 10 minutes apart can produce different numbers purely because of
tunnel weather.

---

## Section E — Recommendations for Media-API Migration

### Must-have before migration starts (baseline period)

**1. Read existing `took` / `seekTime` from the store into the harness** —
`src/stores/search-store.ts:200,202`

The app already extracts ES `took` and computes wall-clock `seekTime`. The harness
ignores both. A single `page.evaluate()` after each perceived-trace test would harvest
them. Also harvest the seek performance.measure entries (`search-store.ts:2551`).
This gives layer-split (ES vs network vs render) at zero app-code cost.

**2. Per-method timing at the DAL public boundary** — `src/dal/es-adapter.ts` public
methods (`search`, `getAggregations`, `seek`/extend, `getByIds`, `getIdRange`)

Instrument the *public methods* that stores call, not the internal `esRequest` transport.
Each method records `{ name, fetchDuration, took, responseSize }` into a timing ring
buffer (or emits a `performance.measure`). This gives:

- `fetchDuration` — wall-clock of the entire call (network + proxy + parse).
- `took` — ES self-reported query time (from response body today; from `Server-Timing`
  header after media-api migration).
- `fetchDuration - took` = network + proxy + parse overhead.
- `name` — which operation ("search", "aggs", "getByIds", etc.) so you can say "the
  totals endpoint regressed 200ms, search is fine."

**Why at this level, not inside `esRequest`:** The `esRequest` method is ES-specific
transport — it disappears or gets replaced when you swap to media-api. The public DAL
methods are the stable interface that stores call regardless of backend. Instrumenting
here means the same metrics survive the migration unchanged. Before: measures
direct-ES latency. After: measures media-api latency. Same metric name, same
subtraction, comparable numbers.

The blue dot display would also benefit from showing `fetchDuration` alongside `took`
(e.g. "42ms / 310ms") — instant at-a-glance "the proxy is adding overhead" signal
during manual testing.

**3. RTT probe at run start** — add to `run-audit.mjs`

Before any test, fire 5 lightweight requests to the cluster. Record median as
`baseline_rtt_ms`. Now you can annotate or normalise: "PP8 was 800ms with RTT 40ms;
today PP8 was 950ms with RTT 80ms — actually no application change."

### Must-have alongside migration stages

**4. `Server-Timing` headers from media-api** — needs engineering sign-off

When media-api becomes the data layer, have it emit `Server-Timing: db;dur=X` on
responses. The browser's Resource Timing API surfaces these for free. The harness reads
them as separate metrics. This is *the* mechanism for per-stage regression attribution.
Once available, the pt. 2 instrumentation reads `took` from this header instead of the
JSON body — same metric, different source, no code change in the stores.

**Why this is lighter than it sounds:** Media-api already Stopwatches every ES query
(`ElasticSearchExecutions.executeAndLog`) and already has the ES `took` value. It
currently only logs these. Server-Timing is not "build new measurement" — it's "expose
existing measurement to the browser via one response header."

#### What needs changing outside `media-api/` for Server-Timing

| Layer | File | Change needed |
|---|---|---|
| **CORS config** | `rest-lib/.../GridComponents.scala` | Add `Server-Timing` to `Access-Control-Expose-Headers`. Without this, the browser silently hides the header from JS on cross-origin responses. |
| **ES timing propagation** | `common-lib/.../ElasticSearchExecutions.scala` | `executeAndLog` already Stopwatches every query but discards the result after logging. Store the duration in a Play Request attribute so it can flow up to the response filter. |
| **Play Filter** | New file in `common-lib` or `rest-lib` | Reads the timing attribute from the request context and writes `Server-Timing: db;dur=X` on the response. ~30 lines. |

| Layer | Status |
|---|---|
| Nginx (dev proxy) | Passes all headers through — no change needed |
| Vite proxy (kupua dev) | Passes all headers through — no change needed |
| Auth service | Not in the API data path — no change needed |
| CloudFront / ALB (production) | May strip non-standard headers — needs verification for PROD deployment. Not a concern for TEST/dev. |

**Total scope:** 2-3 files in shared libs (`common-lib`, `rest-lib`), touching code
that all Grid services inherit. The code change is small (~50 lines total) but requires
sign-off because it touches shared infrastructure.

**Risk:** The main design challenge is propagating timing from deep in the async ES
execution layer up to the response filter. Play's `Request` typed attributes pattern
handles this, but it requires modifying `ElasticSearchExecutions` which all services
use.

**Tech stack:** Play 3.0.10, Scala 2.13.18, `elastic4s` ES client.

### Nice-to-have (high value but larger scope)

**5. "Migration Diff" dashboard view**

Two columns: Baseline (direct-ES) | Candidate (media-api). One row per metric. Delta
column. Red/green threshold colouring. A non-engineer looks at red rows and knows
something regressed — not an automated gate, just a visual signal.

**6. Stacked-bar phase breakdown per action**

[ ES took | proxy overhead | network RTT | browser parse | render ]. Once
`Server-Timing` is in place, this becomes trivial and is the single most useful chart
for "where did the time go."

**7. Memory tracking**

Record `performance.memory.usedJSHeapSize` at test start/end. Detect leaks from
data-layer changes that produce more garbage or hold references differently.

---

## Section F — Migration Instrumentation Strategy (Summary)

```
This weekend (kupua-only, no dependencies):
  → Harvest took/seekTime from store into harness (pt. 1)
  → Add fetchDuration at DAL boundary (pt. 2)
  → Blue dot shows fetchDuration (pt. 3 → visual aid)
  → RTT probe in run-audit.mjs (pt. 4 → noise control)
  → Harvest seek performance.measure entries (pt. 5)
  → Run 5 labelled baseline runs ("Direct-ES baseline")
  → These numbers are your "before" reference

After Monday engineering chat (needs sign-off):
  → media-api emits Server-Timing header
  → CORS exposes Server-Timing to browser
  → Harness reads Server-Timing automatically (Resource Timing API)

Migration phase 1 (media-api for search only):
  → Run same tests with same --runs
  → Compare using existing perceived + new layer-split metrics
  → fetchDuration reveals proxy overhead vs ES cost
  → If migration diff dashboard exists, red rows tell you what regressed

Migration phase 2 (media-api for all endpoints):
  → Same as Phase 1, all metrics
  → Layer breakdown shows exactly where time went
```

---

## Key Insight

The reason past perf audits haven't been actionable is not that the app is perfect — it's
that the harness answers "how fast does the user see content?" without answering "which
layer is responsible for the speed?" When everything goes through one pipe (direct-ES),
this doesn't matter much — it's all one hop. But the moment you introduce a proxy layer
(media-api), you have a new potential bottleneck that the current metrics *cannot
distinguish from ES being slow*. Items 1–4 above fix this before it becomes a problem.

---

## Section G — Production Monitoring: Getting Kupua Numbers into Grafana

The sections above cover **dev-time regression detection** (local Playwright runs,
dashboards in the repo). This section covers a separate question: can kupua's timing
data reach the **production monitoring stack** (Grafana) so the team can watch
real-user performance after deployment?

### What exists today (Grid ecosystem)

| System | What it does | Emits timing? |
|--------|-------------|---------------|
| `@guardian/user-telemetry-client` (kahuna) | Posts JSON events to a central `telemetryUri` (e.g. "GRID_SEARCH" fired) | **No** — event names only, no durations |
| Sentry (kahuna) | Captures JS errors via `CaptureConsole` | **No** — Performance/Tracing module not enabled |
| CloudWatch `MediaApiMetrics` (media-api backend) | `TimeMetric` for search query duration → CloudWatch → Grafana | **Yes, backend only** |
| Structured Stopwatch logging (all backend services) | Logs `elapsed` + ES `took` as Logstash markers | **Yes, backend only** — Grafana reads these |

**Verdict:** No Grid frontend currently emits client-side timing to any monitoring
system. Kahuna has never done it. The backend already pushes per-query durations to
CloudWatch (which Grafana reads), but there is no existing pipeline for browser-measured
numbers.

Mixpanel was used historically — completely stripped, zero traces remain.

### Possible paths (require engineering discussion)

These are options to explore with the team. Items marked "kupua-only" can be built
with agents without touching shared infrastructure. Items marked "needs infra" require
engineering sign-off.

#### Path A: Extend `@guardian/user-telemetry-client` with timing fields

**How:** Kupua imports the same library kahuna uses. Posts events with numeric timing
fields: `{ action: "KUPUA_SEARCH", esTook: 42, fetchDuration: 310, settled: 780 }`.

**Needs:** Verification that the downstream pipeline (whatever receives `telemetryUri`
events) can aggregate on numeric fields (p50, p95). If it only counts events, this
doesn't work for timing.

**Scope:** Kupua-side: trivial (add dependency, emit on search/seek). Infra-side:
depends on pipeline capability — ask the team.

#### Path B: Enable Sentry Performance (tracing)

**How:** Sentry is already initialised in kahuna. Enable `tracesSampleRate` + the
Performance integration. Gets you spans, waterfall traces, Web Vitals (LCP, FID, CLS),
fetch duration breakdown — all in Sentry's dashboard, no code needed beyond config.

**Needs:** Decision on cost (Sentry Performance bills by event volume). Dashboard is
in Sentry, not Grafana — acceptable?

**Scope:** Config-only change in kahuna. For kupua: add Sentry SDK + performance
config. Kupua-only if Sentry org already has Performance tier.

#### Path C: CloudWatch custom metrics via beacon Lambda

**How:** Kupua beacons `{ action, took, fetchDuration, settled }` to a small Lambda
behind API Gateway. Lambda calls `putMetricData` → same CloudWatch namespace the
backend uses → same Grafana dashboards, same alerting.

**Needs:** A new Lambda + API Gateway endpoint (CDK). Deploying it.

**Scope:** Needs infra. ~1 day to build, but requires deployment pipeline access.
Would land numbers directly next to the existing backend metrics in Grafana.

#### Path D: Server-Timing + existing backend logging (no new client emission)

**How:** Once media-api emits `Server-Timing` headers (Section E, pt. 4), the
backend's existing Stopwatch logging already records per-request timing to ELK/Grafana.
The frontend doesn't need to emit anything — the backend logs ARE the performance
record. The e2e-perf harness covers dev-time; production is covered by backend logs.

**Needs:** Server-Timing implementation (Section E, pt. 4). No new client pipeline.

**Scope:** Covered by the media-api migration work itself. Simplest production story.

### What kupua can do without touching infra

Regardless of which production path is chosen, these are self-contained:

1. **Pt. 1–3 from Section E** — read store timings into harness, add fetchDuration at
   DAL boundary, RTT probe. Pure kupua work, no infra, immediately improves dev-time
   regression detection.

2. **Emit timing data to `console.log` in structured JSON** as a stopgap. If the team
   later decides to pipe browser console logs somewhere (e.g. Sentry breadcrumbs
   already capture these), the data is there without code changes.

3. **The blue dot enhancement** (show `fetchDuration` alongside `took`) — pure UI,
   helps manual testing immediately.

### Recommendation

Ask engineering:
- Does the `telemetryUri` pipeline support numeric aggregation? (Path A viability)
- Is Sentry Performance tier available / budgeted? (Path B viability)
- Is Path D (rely on backend logs + Server-Timing) sufficient for production, with
  the e2e-perf harness covering dev-time?

Path D is likely the pragmatic answer: the backend already logs to Grafana, and once
Server-Timing exists, those logs include the full request lifecycle. The e2e-perf
harness (with pts 1–3 implemented) covers the dev/CI side. No new client emission
pipeline needed unless real-user monitoring (percentiles across all users) becomes a
requirement.
