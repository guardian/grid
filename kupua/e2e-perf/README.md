# Perf Test Suite — Reference

> Quick reference for humans and agents interpreting perf audit results.
> Tests live under `e2e-perf/`; the harness is `run-audit.mjs`.

## Two measurement systems

This directory contains **two independent measurement systems** that run from
the same harness but answer different questions:

| System | Asks | Spec files | Output |
|---|---|---|---|
| **Jank** | "Is the browser drawing smoothly while the action runs?" (frame drops, CLS, DOM churn) | `perf.spec.ts` | `audit-log.{json,js,md}` + `audit-graphs.html` |
| **Perceived** | "How long between the user's click and them seeing the result?" (`t_0`, `t_ack`, `t_store_ready`, `t_first_visible_frame`, `t_visual_settled`) | `perceived-short.spec.ts` (single-action) + `perceived-long.spec.ts` (multi-step journeys) | `perceived-log.{json,js,md}` + `perceived-graphs.html` |

Jank reads what the browser reports; no app cooperation needed. Perceived
reads what the app reports via `trace()` calls — see "Perceived
instrumentation" below.

The perceived suite has two flavours, **short** and **long**, that share
one trace API (`src/lib/perceived-trace.ts`), one correlated calculator
(`e2e-perf/perceived-metrics.mjs`),
one log file, and one dashboard. The only difference is test length:
short tests are one user action each; long tests chain several to simulate
realistic workflows. They're tagged `kind: "short" | "long"` per log entry.
PP11 is the browser-owned deep Back restoration action: it reports readiness,
exact-anchor paint, stable geometry and aggregate drift without letting image
identity leave the page. It has no target until its first reviewed baseline.

PP1 waits up to 30 seconds of elapsed time for unpinned Home data and two matching
visible frames at absolute position zero. The deadline is independent of refresh
rate; it is not a performance target. URL, store, buffer, scrubber and geometry
checks remain mandatory. Timeout diagnostics contain readiness flags and numeric
positions only, not image identities or metadata.

## Flag matrix

| Flag | Jank | Perceived (short) | Perceived (long) |
|---|---|---|---|
| `(no flag)` | ✓ | — | — |
| `--perceived` | ✓ | ✓ | ✓ |
| `--perceived-only` | — | ✓ | ✓ |
| `--short-perceived-only` | — | ✓ | — |
| `--long-perceived-only` | — | — | ✓ |

The two `-only` variants exist for fast iteration when editing one half: they
skip the half you're not touching.

Other flags:

| Flag | Effect |
|---|---|
| `--label "..."` | Tags this run in the log. Defaults to `"Quick check"` / `"Unnamed run"`. |
| `--runs N` | Repeat each suite N times; metrics aggregated as median + p95. Long/combined audits require an even count for balanced JB2 AB/BA order. |
| `--dry-run` | Run everything, print summaries, write nothing. |
| `--headed` | Show the browser window (otherwise headless). |
| `--use-media-api` | Route `searchAfter` through the local media-api (instead of direct ES). Requires one-time auth setup — see below. |
| `--prune-history` | No-browser maintenance mode: atomically removes retired and pre-revision-2 replaced jank rows, rebuilds JSON/JS/Markdown, and removes campaigns left empty. |
| `--rebuild-history` | No-browser maintenance mode: atomically regenerates jank JS/Markdown from canonical JSON without adding a campaign. |
| `<P-id list>` | Positional jank-test filter (e.g. `P3,P8`). |

## How to run

Run these commands from the `kupua/` directory. The app mode and audit-runner
mode are configured separately: a media-api campaign requires
`--use-media-api` in **both terminals**. Omitting it from the runner uses the
direct-ES Playwright origin/expectation even if the app was started in
media-api mode, and the environment check rejects the mismatch.

### Direct-ES campaign

```bash
# Terminal 1
./scripts/start.sh --use-TEST

# Terminal 2
node e2e-perf/run-audit.mjs --label "Baseline" --runs 3
node e2e-perf/run-audit.mjs P4a,P4b,P6 --label "Quick jank check"
node e2e-perf/run-audit.mjs P8 --dry-run                         # no log writes
node e2e-perf/run-audit.mjs --short-perceived-only --dry-run     # iterate on PP1-PP11
node e2e-perf/run-audit.mjs --long-perceived-only --runs 4       # journey baseline
node e2e-perf/run-audit.mjs --perceived --label "Full audit" --runs 4
```

### Local media-api campaign

```bash
# Terminal 1
./scripts/start.sh --use-media-api

# Terminal 2 — required fast preflight before any recorded campaign
node e2e-perf/run-audit.mjs P14d,P17,P18 --use-media-api --dry-run --runs 2 --label "media-api jank invariant preflight"
node e2e-perf/run-audit.mjs --use-media-api --long-perceived-only --dry-run --runs 2 --label "media-api long invariant preflight"

# Record only after both preflights pass
node e2e-perf/run-audit.mjs --use-media-api --perceived --label "local-media-api baseline" --runs 4
```

The two preflights take roughly two minutes total, write no history, and exercise
the rapid-traversal landing plus cross-repetition contracts that previously failed
only after a full run.
The runner also aggregates after every repetition, so a future mismatch stops
at the first failing pair rather than after all four repetitions.

A transient proxy error for `/usage/quotas` is optional quota enrichment and
degrades to absent data; it does not invalidate search/perceived scenarios that
do not own quota behavior. Search-after, authentication, alias, or scenario-
owned route failures still invalidate the campaign.

`--dry-run` is the recommended first step whenever running the perceived suite
on a new setup or after changing traced paths. It still runs Playwright; it
just doesn't write the log.

Every invocation writes a uniquely named `$TMPDIR/kupua-perf-<timestamp>-<pid>.log` with the full
jank/perceived Playwright output and any runner-level fatal stack. The harness
prints the resolved path and writes that path only to the ignored
`results/.latest-report-path`, so agents can discover reports created under a
different terminal's TMPDIR without putting TEST output in the public repo.
Later diagnostics never overwrite an earlier campaign report.
Metric JSONL files under `results/` remain structured per-suite evidence.

Cleanup diagnostics are enabled by default in all perf configs, campaign launches
and convenience scripts. `teardown-reporter.mjs` observes Playwright's cleanup
steps without taking over teardown. After the test body it logs `[perf cleanup]`
records for overall cleanup, probe shutdown where applicable, environment capture
and browser-context closure. Each stage has a start record and a completed/failed
record with elapsed milliseconds. A hung stage retains its start record in the
campaign report even if no completion arrives. Context closure includes Playwright's
own artifact finalization; the reporter does not split or reorder that operation.
Only fixed stage labels and scenario IDs are printed, not raw test titles, error
payloads, image data or credentials. Cleanup completion is not proof of unattended
test success when the operator intervened.

History writes are deferred until every requested suite and repetition succeeds.
A later failure therefore leaves both canonical histories unchanged, even when
the jank repetitions completed. The unique report survives; it is not a resumable
campaign checkpoint. This all-or-nothing policy is deliberate: no checkpoints,
partial history, automatic retries or failure suppression.

For a strictly isolated diagnostic, use an exact title filter and preview it with
`--list` through the direct Playwright config. Runner filters differ: jank's `P1`
also matches P11-P18, while the perceived selector does not accept `PP1:`. An
unrecognized perceived selection currently constructs an empty alternation that
runs the full suite before metric validation rejects it. Do not use that path for
bounded diagnostics. From repo root:

```bash
PERF_STABLE_UNTIL=2026-02-15T00:00:00.000Z npm --prefix kupua run test:e2e -- \
  --config=e2e-perf/playwright.perf.config.ts --grep=' P1:' --list
```

After confirming one test, omit `--list`. Cleanup records need no extra flag;
`DEBUG=pw:test` adds verbose fixture diagnostics when required. Do not override
reporters with `--reporter=list` alone, which disables the cleanup reporter.
`--trace=on --output=test-results/perf-p1-diagnostic`
retains traces even when operator intervention releases a hang and Playwright
reports a pass. Such a result is not unattended success. Diagnostic timings are
not benchmark comparisons. Freeze all Vite-watched files while a campaign runs,
including root-level `AGENTS.md`; a documentation save can reload the app.

Run `node e2e-perf/run-audit.mjs --prune-history` only after the replacement
manifest and its pure tests are reviewed. It does not connect to TEST or launch
Playwright. The operation is idempotent and commits all three audit-log siblings
through the same rollback-capable file transaction as normal history writes.

### Running against local media-api (`--use-media-api`)

This routes `searchAfter` through the local media-api instead of going
directly to ES. Useful for measuring the media-api code path end-to-end.

**Topology warning:** in this harness, `Mode: media-api` currently means:

```text
Playwright
  → https://kupua.media.local.dev-gutools.co.uk
  → local Vite
  → local media-api
  → SSH tunnel
  → TEST Elasticsearch
```

It does **not** mean Kupua is calling a deployed TEST media-api. Results include
local JVM, local proxy, authentication, and tunnel effects that a deployed
media-api does not share. The environment fingerprint records `dataMode` and the
Kupua origin, but does not yet encode media-api deployment topology; put
`local-media-api` in the label and interpretation.

The 12 September 2026 campaign labelled `Matched media-api baseline 2026-09-12`
used this local-media-api topology. Its comparison direct-ES campaign used
`http://localhost:3000`, whereas media-api authentication required the HTTPS
Kupua origin. The application code was the same, but the browser origins were
not, so the pair is suitable for broad local-path characterization rather than
isolating only the `searchAfter` implementation. A future controlled pair should
run direct ES through the same HTTPS Kupua origin using `KUPUA_PERF_BASE_URL`, or
record origin/proxy overhead separately.

**Deployed-TEST evidence:** the June 2026 before/after deployment experiment
measured shared Elasticsearch-client gzip behavior on deployed TEST media-api's
existing `/images` route. It did not run Kupua's D3 `/images/search-after`
journeys. The D3 TS and Scala commits are not ancestors of `origin/main`, and no
checked-in evidence has been found of a full Kupua perf campaign against a
deployed TEST build containing D3. Treat that as a distinct, currently unmeasured
topology unless deployment records establish otherwise.

**Prerequisites (every session):**

1. The full Grid dev stack must be running — media-api needs to be up.
2. Start kupua with the matching flag:
   ```bash
   ./scripts/start.sh --use-media-api
   ```
   This implies `--use-TEST` (ES tunnel on port 9200) plus
   `VITE_USE_MEDIA_API=true`.
3. Pass `--use-media-api` to the audit runner too. The runner then uses
  `https://kupua.media.local.dev-gutools.co.uk` as Playwright's origin. This is
  required because the authenticated Grid cookies are domain-scoped and are not
  sent by a page on `http://localhost:3000`. If the environment fingerprint says
  `Base URL: http://localhost:3000`, the media-api runner flag was omitted or the
  Playwright config was invoked directly.
4. Local media-api must have the same `field.aliases` configuration as TEST. See
  the alias preflight below.

#### Authentication state

Playwright `storageState` is the appropriate mechanism for this manual harness,
but the file contains live session credentials. **Never place the real JSON file
under `kupua/`, inspect it, print it, paste it into chat or a report, or commit it.**

Generate it at a private location outside the repository. The example path is
deliberately generic; choose any user-private directory outside a Git worktree:

```bash
# Run from the grid repository root.
mkdir -p "$HOME/.config/kupua-playwright"
chmod 700 "$HOME/.config/kupua-playwright"
kupua/node_modules/.bin/playwright codegen \
  --save-storage="$HOME/.config/kupua-playwright/panda-auth.json" \
  https://kupua.media.local.dev-gutools.co.uk
```

In the browser that opens, sign in to **both**:
- `https://media.test.dev-gutools.co.uk/` — captures the `.test.dev-gutools.co.uk` cookie (used by Collections tree etc.)
- `https://media.local.dev-gutools.co.uk/` — captures the `.local.dev-gutools.co.uk` cookie (used by local media-api)

Then **close the browser** — the file is written on exit, not during the session.
Restrict access to the result:

```bash
chmod 600 "$HOME/.config/kupua-playwright/panda-auth.json"
```

The current runner expects `e2e-perf/.panda-auth.json`. Bridge that expected name
to the external file with a symlink; do not copy the JSON into the repository:

```bash
# Run from the grid repository root.
ln -s "$HOME/.config/kupua-playwright/panda-auth.json" \
  kupua/e2e-perf/.panda-auth.json

# Must succeed silently before running the harness.
git check-ignore -q kupua/e2e-perf/.panda-auth.json
```

That bridge path is tracked in `kupua/.gitignore` as defense in depth. Ignoring it
does not make an in-repository credential safe: the symlink target remains the
only acceptable arrangement. Remove only the bridge after the campaign; retain
or delete the external state according to local policy:

```bash
rm kupua/e2e-perf/.panda-auth.json
```

The harness exits if the bridge is missing. Auth failures, redirects, HTTP
401/419, empty authenticated responses, or API errors invalidate the campaign;
refresh the external state rather than treating them as performance evidence.
Never route passwords, MFA prompts, cookie values, or the state file through an
agent. Complete interactive sign-in directly in the opened browser.

**Future hardening:** the runner should accept an explicit external auth-file
path, reject regular credential files inside the repository, and remove the
symlink bridge entirely. The Playwright configs already consume
`KUPUA_PERF_AUTH_FILE`; the runner is the remaining hardcoded layer.

#### Field-alias preflight

D3's media-api `searchAfter` response intentionally omits bulk `fileMetadata`.
It adds back only the small leaf paths listed by media-api's runtime
`field.aliases`, then exposes their values under `image.aliases`. The same config
also resolves CQL aliases such as `colourModel` and `colourProfile` to their real
Elasticsearch paths.

Kupua currently carries its own alias list in `src/lib/grid-config.ts`. If local
media-api starts with `field.aliases=[]`, the two sides silently diverge:

- alias-backed metadata disappears from every media-api search hit;
- alias CQL can query a literal unmapped field and return misleading results;
- the long perceived journey fails, but shorter scenarios may still pass.

This commonly occurs with `dev/script/start.sh --use-TEST`: deployed TEST reads
aliases from its common configuration, while the script downloads only the
per-app media-api and kahuna files. Ordinary local setup also usually embeds
shared settings into each service-specific file, so `~/.grid/common.conf` may
legitimately be absent.

For a representative media-api perf run, place **only the reviewed TEST
`field.aliases` block** in `~/.grid/common.conf`, never an unreviewed complete TEST
configuration, then restart media-api. The larger product fix is to establish one
server-authoritative runtime-config path and fail loudly on alias-contract drift;
the perf harness must not conceal that architecture gap.

The required two-run long preflight above also validates field aliases after a
media-api restart. JA exercises returned alias metadata; JB exercises an alias-
backed filter and indexed scrolling:

```bash
node e2e-perf/run-audit.mjs \
  --use-media-api \
  --long-perceived-only \
  --dry-run \
  --runs 2 \
  --label "media-api auth and alias preflight"
```

Do not start a recorded campaign unless the preflight is green and its environment
fingerprint reports both `Mode: media-api` and the HTTPS Kupua base URL.

## Dashboards

Both dashboards are static HTML pages opened directly from disk
(`open results/audit-graphs.html`) — no server needed. Each loads a sibling
`.js` file (`audit-log.js` / `perceived-log.js`) written by the harness, which
sidesteps the browser's `file://` fetch ban. After each new run, refresh.

`audit-graphs.html` shows one sparkline per jank test across every
`audit-log.json` entry. **If new metric or entry keys appear that the page
doesn't recognise, it shows a red banner** asking you to update
`KNOWN_METRICS` / `KNOWN_ENTRY_KEYS` near the top of the file. That banner is
the contract — when adding a new metric to `perf.spec.ts` / `run-audit.mjs`,
also add it to `KNOWN_METRICS`.

Both dashboards plot every checked data mode on the same chart: direct ES is
blue, media-api is amber, and legacy/unknown is gray. "Comparable within each
mode" filters each line against that mode's own latest environment and scenario
contract, rather than allowing the globally latest mode to hide the others.
Latest values and deltas are likewise mode-local; they are not claims that two
different deployment topologies are equivalent.

`perceived-graphs.html` shows one sparkline per scenario across
every `perceived-log.json` entry, with checkboxes to filter by kind
(short / long), an opt-in background-diagnostics section, and a metric selector
for explicit boundaries (`dt_ack_ms`, `dt_store_ready_ms`,
`dt_first_visible_frame_ms`, `dt_visual_settled_ms`, status and store timing).
Pre-revision-2 aliases remain separately selectable under **Legacy evidence**.

Each run entry includes `baseline_rtt_ms`: median of 5 pings to ES before
the suite. Useful for attributing slow runs to network vs. app code.

---

## Jank suite — test inventory

### Network/ES Dependency

Tests fall into three categories. This matters for result stability:

| Category | Tests | Single-run noise | Notes |
|----------|-------|-------------------|-------|
| **Client-only** | P4a, P4b, P5a/b/c, P7, P13a/b, P14a/b/c/d, P15a/b/c, P16a/b | **Low** (±5%) | No ES requests inside the measured action. P7 preloads lazy distribution setup and excludes pointer release/seek. |
| **Mixed** (client work triggered by data response) | P2, P8, P17, P18 | **Medium** (±15%) | Scroll can trigger buffer requests. P18 hydrates 99 selected images through direct-ES `_mget` in both app modes; its route attribution deliberately ignores unrelated `/api` responses. Jank spikes may correlate with response timing. |
| **ES-dominated** | P1, P3, P3b, P6, P9, P11, P11b | **High** (±20%+) | Test measures the full round-trip: ES query → response processing → render. SSH tunnel latency and cluster load dominate. |

**Practical guidance:**
- Use `--runs 1` during development for all tests. Don't panic about ±15% on ES-dominated tests.
- Use `--runs 3` for jank/short baselines and `--runs 4` for long or combined
  baselines so JB2's matched control has balanced AB/BA order.
- When evaluating a coupling-fix phase that targets client-side performance (e.g. handleScroll stabilisation), focus on the client-only tests (P4, P5, P14, P15, P16). These give reliable signal from a single run.
- When an ES-dominated test shows a big change, re-run with `--runs 3` before concluding it's a real regression.

### Focus Position Tracking

Tests P4a, P4b, P6, and P13b emit focus-placement diagnostics in their
structured metrics. These measure how accurately the focused image's viewport
position is preserved across transitions:

| Test | Transition | What drift means |
|------|-----------|------------------|
| **P4a** | Grid → Table | Focused image moved N pixels from where it was in grid view |
| **P4b** | Table → Grid | Same, reverse direction |
| **P6** | Sort direction toggle | Focused image moved N pixels despite sort-around-focus |
| **P13b** | Detail close to list | Signed vertical/horizontal return-placement drift |

`focusDriftPx = 0` is perfection. Anything within ±ROW_HEIGHT (~32px table, ~303px grid) is acceptable — the image is on screen. Drift beyond viewport height means the image scrolled out of view: a "Never Lost" violation.

**Note:** P4a, P4b, and P6 emit `focusDriftPx` / `focusDriftRatio`; P13b emits
signed vertical and horizontal pixel drift plus final visibility.

### Per-Test Reference

| ID | What it measures | Duration | Key metrics to watch |
|----|-----------------|----------|---------------------|
| **P1** | Cold navigation through visible results plus two frames | ~3s | CLS, maxFrame, LoAF, DOM churn, FP/FCP and navigation milestones. |
| **P2** | Grid mousewheel scroll (30 events) | ~4s | severe, p95Frame, domChurn. Scroll smoothness. |
| **P3** | Scrubber seek to 50% (date sort) | ~5s | maxFrame, LoAF. Buffer replacement cost. |
| **P3b** | Scrubber seek to 50% (keyword sort) | ~8s | Same. Exercises composite-agg + binary-search path. |
| **P4a** | Grid→Table density switch | ~2s | maxFrame, domChurn, **focusDriftPx**. Mount/unmount cost. |
| **P4b** | Table→Grid density switch | ~2s | Same. Typically lighter than P4a. |
| **P5a/b/c** | Panel open/close; P5c measures left close only | ~3s | CLS, maxFrame, P5c results-width delta. |
| **P6** | Sort direction toggle | ~6s | maxFrame, LoAF, **focusDriftPx**. "Never Lost" accuracy. |
| **P7** | Continuous scrubber thumb drag before release | ~2s | domChurn, maxFrame. Client-only direct-DOM tracking; PP7b owns release-to-settle. |
| **P8** | Table fast scroll (80 wheel events) | ~6s | severe, p95Frame, CLS, domChurn. **Known worst case.** |
| **P9** | Sort field change | ~3s | maxFrame, CLS. Full result set replacement. |
| **P11** | Thumbnail CLS after seek (3 positions) | ~15s | CLS per seek position. Image loading stability. |
| **P11b** | Same, keyword sort variant | ~15s | CLS comparison across sort types. |
| **P13a/b** | Image detail enter/exit | ~5s | CLS, maxFrame. Overlay transition quality. Scroll restoration. |
| **P14a** | Image traversal, normal (10 fwd @ 2/s) | ~6s | maxFrame, severe, **landingRenderMs**, **renderedCount**. Browsing-pace image swap smoothness. |
| **P14b** | Image traversal, fast burst (15 fwd @ 5/s + 3s settle) | ~7s | severe during burst, CLS/LoAF during settle, **landingRenderMs**, **swappedNotRendered**. Does the app load only the final image? |
| **P14c** | Image traversal, fast backward (10 back @ 5/s + 3s settle) | ~6s | Same as P14b, reverse direction. Prefetch-behind effectiveness. |
| **P14d** | Image traversal, rapid discrete burst (20 fwd @ 12/s) | ~5s | Cancellation stress test. Most images should not render; landing latency and CLS occurrence are primary. |
| **P15a/b/c** | Fullscreen enter/traverse/exit | ~4s | maxFrame. Should be near-zero (Fullscreen API is cheap). |
| **P16a/b** | Column drag-resize + double-click fit | ~3s | maxFrame, domChurn. CSS-variable path. Should be near-zero. |
| **P17** | Reverse grid scroll from first backward-prepend trigger through 200ms quiescence | ~5s | severe, p95Frame, LoAF, DOM churn, route class, prepend count, direction violations. Includes any natural causally-following prepend cascade rather than suppressing it. |
| **P18** | Shift-click result 99 from a settled result-0 anchor with Details open | ~2s | maxFrame, LoAF, selection publication, metadata/reconcile/visual settlement. Cold-except-anchor, exactly 100 selected. |

### Jank metrics glossary

| Metric | Unit | What it means | Good | Bad |
|--------|------|---------------|------|-----|
| CLS | ratio | Cumulative Layout Shift (unexpected shifts only) | < 0.01 | > 0.1 |
| maxFrame | ms | Worst single frame duration (rAF delta) | < 50 | > 200 |
| severe | count | Frames > 50ms | 0 | > 10 |
| p95Frame | ms | 95th percentile frame duration | < 20 | > 50 |
| domChurn | count | DOM mutations (add + remove + attribute changes) | < 500 | > 10k |
| loafBlocking | ms | Total Long Animation Frame blocking time | < 50 | > 500 |
| focusDriftPx | px | Focus position change across transition | 0 | > viewportHeight |
| focusDriftRatio | ratio | Focus position change as fraction of viewport | 0.0 | > 0.5 |
| landingRenderMs | ms | Time from traversal-stop until landed image renders (0 = prefetch hit) | 0 | > 2000 |
| landingNetworkMs | ms | imgproxy network time for the landing image | < 200 | > 1000 |
| renderedCount | count | Images that rendered before user moved on (P14 traversal) | N at slow | — |
| swappedNotRendered | count | Images where src changed but never decoded in time | 0 | > N/2 |

---

## Measurement discipline for later work

Apply these rules before adding a metric or using one to justify an optimization:

1. **One row, one owned action.** Setup, the measured interaction, and cleanup
  must be explicit. Split compound workflows; never sum unrelated windows.
2. **Start at the real trigger.** Install navigation probes before navigation;
  mark clicks and keys in their owning handler before state mutation.
3. **End at an observable outcome.** Prefer exact identity, decoded content,
  visible target context, native state, or stable geometry over fixed sleeps.
4. **Correlate asynchronous phases.** An interaction ID must own every phase.
  Temporal adjacency is not causality, especially with background fetches.
5. **Preload lazy setup when measuring client work.** Clear probe/resource state
  afterward and assert zero measured requests when the contract is client-only.
6. **Fail closed.** Missing controls, wrong regimes, incomplete commits, absent
  phases, changed environments, or malformed logs invalidate the row.
7. **Persist the explanation.** Retain revision, boundary, regime, routes,
  environment, sample count, and scenario-specific diagnostics needed to
  explain a value. Sanitize identity, URLs, bodies, and credentials.
8. **Do not compare changed contracts.** Scenario revision, cache class, corpus,
  environment, and measurement boundary are comparability gates, not footnotes.
9. **Use the right owner.** Jank measures drawing smoothness; perceived traces
  measure action-to-outcome latency; habitual E2E owns correctness. A single
  row should not impersonate all three.
10. **Prefer deletion to ceremonial coverage.** If TEST falsifies a scenario's
   distinct premise, remove it rather than manufacturing a weaker substitute.

**Playwright spec import trap:** a perf spec is transformed in Node before the
browser starts. Do not import a browser/Vite module that evaluates
`import.meta.env` at module scope (for example `src/constants/tuning.ts`), or
test discovery fails with `import.meta.env` undefined. Prefer an environment-
independent module; if a fixed setup assumption is unavoidable, define it next
to the scenario, link it to the source constant, and add a fail-closed runtime
guard that invalidates the scenario when the assumption no longer holds.

For optimization work, write down before editing: the user-visible hypothesis,
the metric expected to move, a metric expected not to regress, and the cheapest
check that could disprove the hypothesis. Treat a green but non-discriminating
measurement as no evidence.

---

## Perceived suite — instrumentation

The owning module is **`src/lib/perceived-trace.ts`**. The whole feature is
removable by deleting that file and reverting its ~10 call sites.

### When marks are collected

| Environment | Default | How to enable |
|---|---|---|
| Production build | **Never.** Tree-shaken via `import.meta.env.DEV` gate. Zero runtime cost. | n/a — by design |
| Dev (`npm run dev`) | Off — keeps console clean | `localStorage.setItem("kupua_perceived_perf", "1")` then refresh |
| Playwright (any perf run) | Always on — Playwright sets the flag before navigation | n/a — automatic |

Real users see nothing, ever. Devs opt in. Tests are unconditional.

The two gates are independent and serve different audiences: `import.meta.env.DEV`
is the production-safety gate (tree-shakes the code path out of real users'
bundles); the `localStorage` flag is the dev-noise gate (so a fresh `npm run dev`
isn't accumulating `performance.mark()` entries and a 500-item ring buffer in
every dev's browser by default).

### How marks are stored

Each `trace()` call has two side-effects:

1. `performance.mark("perceived:<action>:<phase>", { detail: payload })` —
   visible in DevTools → Performance panel.
2. Push onto `window.__perceivedTrace__` ring buffer (capped at 500
   entries, oldest evicted). Carries the rich `payload`.

Helpers exposed on window when enabled:
- `window.__perceivedTrace__` — the buffer; read directly.
- `window.__perceivedTraceClear__()` — wipe buffer (Playwright calls
  before each scenario).

### Canonical API contract

`src/lib/perceived-trace.ts` MUST export exactly this signature. Call sites
depend on it; do not bikeshed.

```ts
export interface TraceEntry {
  action: string;       // e.g. "sort-around-focus", "home-logo", "scrubber-seek"
  phase: string;        // e.g. "t_0", "t_ack", "t_store_ready", "t_visual_settled"
  t: number;            // performance.now() at emission
  payload?: unknown;    // optional per-action context
}

export function trace(action: string, phase: string, payload?: unknown): void;
```

Phase markers (in causal order):
- `t_0` — user-initiated event (click, key, navigation commit). The audit
  doc's "Trigger boundaries" table prescribes the exact site for each action.
- `t_ack` — earliest visible response (loading state set, banner shown).
- `t_status_visible` — a status affordance (spinner, banner) became visible.
- `t_seeking` — a sub-phase of multi-stage actions (e.g. sort-around-focus
  reaches the seek step).
- `t_store_ready` — the exact interaction's target state is atomically published.
- `t_first_visible_frame` — the target context has real visible content in a browser frame.
- `t_visual_settled` — the target content and required geometry are stable over the scenario's browser-observed window.

`computeCorrelatedMetrics()` requires exactly one interaction ID and calculates
only phases carrying that ID. Temporal adjacency is not ownership. Revision-2
rows emit only explicit boundary names. Historical `dt_first_pixel_ms` and
`dt_settled_ms` values remain readable in the dashboard's **Legacy evidence**
group, but are not relabeled or compared as revision-2 browser boundaries.

### Call-site shape

Always one line, never wrapped in conditionals — the `ENABLED` gate inside
`trace()` is the only check:

```ts
import { beginTraceInteraction, traceInteraction } from "@/lib/perceived-trace";

const interactionId = beginTraceInteraction("sort-around-focus", { sort, focusedId });
traceInteraction("sort-around-focus", "t_store_ready", interactionId);
```

### When to run the perceived suite

Same manual-only / TEST-cluster discipline as the jank suite. Re-run after
touching:

- `src/stores/search-store.ts` — search / seek / extend / sort-around-focus
- `src/hooks/useDataWindow.ts`, `src/hooks/useScrollEffects.ts`
- `src/lib/orchestration/`, `src/lib/reset-to-home.ts`
- Position-map / phantom-focus / sort-around-focus paths
- Status banners (`StatusBar.tsx`; anywhere `sortAroundFocusStatus` is set/read)
- Any `trace()` call site or the `perceived-trace.ts` module itself

The agent should **suggest** running the suite to the user — never run it
autonomously (real ES required, per-session permission).

### Perceived-suite diagnostic fields (store timing)

Every perceived scenario (short + long) also harvests these fields from the
store after settle and writes them into the per-scenario JSON. They appear in
the `perceived-graphs.html` metric selector under "Store timing (post-settle)".

| Field | Unit | Source | What it means |
|-------|------|--------|---------------|
| `took` | ms | `SearchResult.took` (ES response) | ES self-reported query time for the last primary search. Excludes network. |
| `fetchDuration` | ms | `Date.now()` wrapper around `search()` | Full wall-clock from store calling `search()` to result return. `fetchDuration - took` = network + proxy + JSON.parse overhead. |
| `seekTime` | ms | `search-store.ts` seek path | Wall-clock of the most recent scrubber seek (all ES round-trips combined). |
| `aggTook` | ms | `AggregationsResult.took` (ES response) | ES self-reported time for the filter-aggregation query. |
| `aggFetchDuration` | ms | `Date.now()` wrapper around `getAggregations()` | Full wall-clock for the agg query. `aggFetchDuration - aggTook` = network overhead for aggs. |

PP7/PP7b/PP7c also capture `seekMeasures`: the `seek:*` `performance.measure`
entries the app emits during a seek, giving sub-seek breakdown (forward fetch /
backward fetch / compute+set / render+paint). Not plottable as a sparkline
(array-valued); inspect `perceived-log.json` directly.

`baseline_rtt_ms` is written at the entry level (not per-scenario): it's the
median of 5 `GET /_cat/aliases` pings fired directly against ES (bypassing
the Vite proxy) before any test runs.

### Targets (Phase 1, from `exploration/docs/perceived-perf-audit.md`)

| Action | Target median | Hard ceiling p95 |
|---|---|---|
| Logo / home / reset / panel toggle | <100 ms ack, <200 ms settle | 300 ms settle |
| Density swap | <100 ms ack, <400 ms settle | 800 ms settle |
| Filter / sort toggle | <100 ms ack, <1 s settle | 2 s settle |
| Search (warm) | <100 ms ack, <1.5 s first useful pixel | 3 s |
| Search (cold) | <100 ms ack, <2.5 s first useful pixel | 4 s |
| Sort-around-focus | <100 ms ack, <2 s settle | 4 s; status banner ≤2 s |
| Scrubber seek | <100 ms ack on click, <1 s first useful pixel | 2 s |

Calibration anchors:
- Home logo at ~200 ms is **felt** — lower discomfort bar.
- Removed scripted sort at ~14 s was **unacceptable** — upper bar.

### Debugging a single complaint without a full suite run

1. `npm run dev`.
2. DevTools console: `localStorage.setItem("kupua_perceived_perf", "1")` then refresh.
3. Reproduce the slow action.
4. `copy(JSON.stringify(window.__perceivedTrace__, null, 2))`. Paste into a file.

Or read historical results directly:
```bash
cat e2e-perf/results/perceived-log.md   # human-readable, both kinds
cat e2e-perf/results/perceived-log.json # machine-readable
```

---

## Experiments suite (archived, not routinely run)

`experiments.spec.ts` + `playwright.experiments.config.ts` is an agent-driven
A/B testing harness for tuning knob experiments (overscan, PAGE_SIZE, scroll
speeds, image format comparisons). It requires a headed browser and manual
supervision.

**Not part of the regular test surface.** Useful reference for:
- Per-image render timing methodology (now migrated into P14)
- Smooth autoscroll (rAF-loop scroll, not wheel events)
- Named scroll/traversal speed tier calibration values
- Knob experiment workflow (modify source → run → revert → compare JSON)

Results live in `results/experiments/`. See `results/experiments/README.md`
for the full signals glossary and JSON schema.
