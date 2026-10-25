# Performance Campaigns

Habitual, operator-run measurements of the configured app. Agents may run local
validation, **not campaigns or dry runs**. Run commands from the repository root.

## Run

Start Kupua separately in the matching backend mode, then use four repetitions:

```sh
npm --prefix kupua run test:perf -- --suite justified --use-media-api --runs 4 --label "density baseline"
npm --prefix kupua run test:perf -- --full --use-media-api --runs 4 --label "full baseline"
```

`--suite justified` selects density comparisons, including Grid and Table; it is
not Justified-only. `--full` includes rendering, short/long responsiveness and
density. No suite flag selects rendering only. The runner does not start the app.

Use `--use-deployed-media-api` instead for deployed TEST, or omit the API flag for
direct ES. Add `--canonical-media` to both app startup and the campaign command to
measure returned media URLs; without it the campaign requires proxy delivery.
Backend/delivery flags, authentication and running app must agree. The strict
`typecheck:perf` preflight runs automatically; do not bypass it.

Keep output live with `set -o pipefail` and `2>&1 | tee "$TMPDIR/kupua-test-output.txt"`.
Do not poll, edit source/docs, drive the app or start competing work during a run.

<a id="authentication-state"></a>
## Renew Authentication

Replace the placeholder with the path to your existing cookie file outside the repository:

```sh
kupua/node_modules/.bin/playwright codegen --save-storage="[enter path to your cookie file]" https://kupua.media.local.dev-gutools.co.uk
```

Sign in within that codegen browser: TEST Grid for deployed API mode, local Grid for
local API mode. Close the browser to save the refreshed state, then rerun the original
campaign from the beginning. Keep the existing ignored symlink pointing to that file.
See [first-time setup and domain details](campaign-setup.md#authentication-state).

The runner stops for a missing auth file, required app/API HTTP 401/419 or a confirmed
`/login` redirect, and prints the command above as a plain copyable line. It does not
launch login automatically, add a reauth option or resume a partial campaign. Detection
uses existing requests, not a new live auth probe. Timeouts, PP3 degradation, unrelated
image failures and generic server errors are not treated as expired authentication.
For an auth stop, the runner suppresses the follow-on interruption stack cascade and
prints the renewal command last. Other failures retain their normal diagnostic output.

<a id="flags"></a>
<a id="preconditions-and-backend-setup"></a>
## Before Running

- Use normal development Kupua and its intended windowed datasource, not resident fixtures.
- Keep the headed browser foregrounded and unobscured; preserve viewport/DPR and cutoff.
- Confirm the backend stage and permission. No live writes or implicit ES fallback.
- Keep credentials outside this public repository. Never print storage state or signed URLs.
- Record a useful label. Labels and compatible environments do not establish matched content,
  proxy/CDN warmth or causal before/after comparisons.

See [setup, authentication and all flags](campaign-setup.md). Campaigns and dry runs
remain operator-run even when the command does not append history.

## Results

Start with the [unified dashboard](results/index.html). All dashboards are colocated
in `results/`; the individual family pages below remain available.

| Family | Canonical history | Dashboard |
| --- | --- | --- |
| Rendering | [audit-log.json](results/audit-log.json) | [Rendering](results/audit-graphs.html) |
| Short/long responsiveness | [perceived-log.json](results/perceived-log.json) | [Responsiveness](results/perceived-graphs.html) |
| Density | [density-log.json](results/density-log.json) | [Density](results/density-graphs.html) |
| Campaign membership | [campaign-log.json](results/campaign-log.json) | Selectable checkpoints in the [unified dashboard](results/index.html) |

Every entry from one runner invocation carries the same `campaignId`; the manifest
(requested suites, runs, filter, topology/delivery, entry refs) is published in the same
all-or-nothing transaction. Only manifests with every requested suite, full repetitions
and no test filter are `complete` and become dashboard checkpoints. Older entries have no
ID and are never back-filled.

Open dashboards from disk; no server is needed. Successful selected suites append
history and regenerate sidecars. Density history is retained as JSON and browser JS;
the redundant full-history Markdown export is no longer generated. Failed attempts retain diagnostics, not partial
benchmark history. The runner prints its unique log path and records it in ignored
`results/.latest-report-path`. Refresh dashboards after completion.

All three distinguish API topology and media delivery. Campaign / Compare with
selects an explicit pair; ordinary history lines never mix proxy and canonical
delivery. See [comparison limits and historical corrections](measurement-reference.md#delivery-comparisons).

<a id="density-comparisons-and-thumbnail-exposure"></a>
<a id="normalized-directional-journeys"></a>
<a id="burst-reverse-and-recover"></a>
<a id="visible-waits-and-request-cohorts"></a>
<a id="historical-d10-sustained-scrolling"></a>
<a id="search-refresh-under-media-load"></a>
<a id="recorded-measurement-baseline"></a>
<a id="reading-the-measurements"></a>
<a id="coverage-limits"></a>
<a id="dashboards-and-reports"></a>
## Interpret

Density must expose useful progress/current-image readiness, frames and identity/
position stability separately. Smaller backlog or more travelled pixels alone is
not success. Inspect censoring, coverage, costs and achieved demand before timings.

- `t_ack` — synchronous action acknowledgement by its current producer; not a DOM-visible boundary.
- `t_first_visible_frame` — the target context has real visible content in a browser frame; not necessarily decoded or settled.
- Loaded, decoded and painted are distinct. Canonical unavailable paint is not zero flashes.
- Four repetitions are four observations, not population-tail estimates.

The [measurement reference](measurement-reference.md) owns workload/metric contracts,
dashboard formulas, historical compatibility and interpretation. The
[scrolling evidence guide](../exploration/docs/scroll-horizons-thumbs-and-blocking.md)
owns findings and decisions, not campaign operation.

<a id="local-validation"></a>
<a id="buffer-bounds-and-final-viewport-controls"></a>
<a id="maintaining-measurements"></a>
<a id="measurement-discipline-for-later-work"></a>
## Ownership

| Location | Purpose |
| --- | --- |
| This directory's specs, drivers/probes, runner/configs and reporting | Maintained habitual campaigns and shared measurement infrastructure |
| [validation](validation/README.md) | Offline, synthetic-browser and app-backed detector validation; no campaign history |
| [research](research/README.md) | Explicit exploratory comparisons and diagnostics, separate from habitual runs |
| [ordinary E2E](../e2e/README.md) | Product correctness regressions; no performance benchmarks |

Local validation commands remain `typecheck:perf`, `test:perf-harness`,
`test:perf-fixtures` and `test:perf-app`; see their [guide](validation/README.md).
Research has its own entry point and [control recipes](research/controls.md).
Preserve useful methods by promoting signals into habitual campaigns or detector
checks into validation; important questions must not depend on forgotten probes.
