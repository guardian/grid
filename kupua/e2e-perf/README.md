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
direct ES. Backend flags, authentication and running app must agree. The strict
`typecheck:perf` preflight runs automatically; do not bypass it.

Keep output live with `set -o pipefail` and `2>&1 | tee "$TMPDIR/kupua-test-output.txt"`.
Do not poll, edit source/docs, drive the app or start competing work during a run.

<a id="flags"></a>
<a id="preconditions-and-backend-setup"></a>
<a id="authentication-state"></a>
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

| Family | Canonical history | Dashboard |
| --- | --- | --- |
| Rendering | [audit-log.json](results/audit-log.json) | [Rendering](results/audit-graphs.html) |
| Short/long responsiveness | [perceived-log.json](results/perceived-log.json) | [Responsiveness](results/perceived-graphs.html) |
| Density | [density-log.json](results/density-log.json) | [Density](results/density-graphs.html) |

Open dashboards from disk; no server is needed. Successful selected suites append
history and regenerate sidecars. Failed attempts retain diagnostics, not partial
benchmark history. The runner prints its unique log path and records it in ignored
`results/.latest-report-path`. Refresh dashboards after completion.

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
