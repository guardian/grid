# Performance campaigns

Manual, operator-run measurements against a configured Grid development environment.
Agents may run the local validation commands below, **not campaigns or dry runs**.
Run all commands from the **repository root**. The `--` after `run test:perf` forwards
subsequent arguments to the campaign runner.

## Quick start

With Kupua already running in the matching backend mode:

```bash
# Everything: rendering, short/long responsiveness, density and thumbnail comparisons
npm --prefix kupua run test:perf -- --full --use-media-api --runs 4 --label "full baseline"

# Only density/thumbnail comparisons, including Grid controls and Table diagnostics
npm --prefix kupua run test:perf -- --suite justified --use-media-api --runs 4 --label "density baseline"
```

Omit `--use-media-api` for direct ES, or replace it with `--use-deployed-media-api`
for deployed TEST. The runner does not start or reconfigure your app.

## What runs and where results go

<a id="two-measurement-systems"></a>

| Selection | Rendering/jank | Short responsiveness | Long journeys | Density/thumbnail comparisons |
| --- | --- | --- | --- | --- |
| No suite flags | Yes | — | — | — |
| `--perceived` | Yes | Yes | Yes | — |
| `--perceived-only` | — | Yes | Yes | — |
| `--short-perceived-only` | — | Yes | — | — |
| `--long-perceived-only` | — | — | Yes | — |
| `--suite justified` | — | — | — | Yes |
| `--suite combined` | Yes | — | — | Yes |
| **`--full`** | **Yes** | **Yes** | **Yes** | **Yes** |

`--full` is shorthand for `--suite combined --perceived`. Both spellings work.
It cannot be combined with partial-suite flags, a different suite or scenario filters.
Other perceived flags can be combined with `--suite combined` to select a smaller mix.

| Results | Written by | Dashboard |
| --- | --- | --- |
| `results/audit-log.{json,js,md}` | Rendering/jank suite | [Rendering](results/audit-graphs.html) |
| `results/perceived-log.{json,js,md}` | Short/long responsiveness suites | [Perceived responsiveness](results/perceived-graphs.html) |
| `results/density-log.{json,js,md}` | Density comparison suite | [Density comparisons](results/density-graphs.html) |

Dashboards retain earlier results: running one suite does not clear the others, but it
also does not add new points to their histories. The perceived dashboard additionally
reads detail/image-read diagnostics from the jank history; it does not duplicate them.

**The rendering/responsiveness suites already test Grid↔Table transitions, but not
Justified.** The density suite compares Grid/Justified and adds Table thumbnail diagnostics;
its name does not mean every case runs only in Justified.

## Flags

| Flag | Meaning |
| --- | --- |
| `--full` | All maintained suites. Does not run archived experiments. |
| `--suite existing\|justified\|combined` | Choose the suite family; `existing` is the default. |
| `--perceived`, `--perceived-only`, `--short-perceived-only`, `--long-perceived-only` | Choose rendering/responsiveness coverage as shown above. Mutually exclusive. |
| `--runs N` | Repetitions; default 1. Use 4 for baselines. Recorded runs including long journeys require an **even** count; a one-run dry diagnostic is allowed. |
| `--label "..."` | A useful description of the tested change/environment; otherwise “Unnamed run”. A label does not select a workload. |
| `--use-media-api` | Local media-api over the TEST tunnel; requires the matching app mode and authentication. |
| `--use-deployed-media-api` | Deployed TEST media-api; requires the matching app mode and authentication. Cannot combine with the local API flag. |
| `--dry-run` / `--no-log` | Executes tests without appending campaign history. **Still performs reads and writes diagnostic reports.** |
| `--headed` | Explicitly requests a visible browser. Maintained campaign configurations already run headed. |
| Positional scenario-ID list | Advanced filtering, not density selection. Obtain current identifiers from the relevant spec; runner matching is regex-based, not exact-title matching. Not accepted with `--full` or justified-only. |
| `--rebuild-history` | No-browser maintenance: regenerate jank JS/Markdown from canonical JSON. |
| `--prune-history` | Destructive jank-history maintenance using the current replacement manifest. Review before use; not a normal campaign step. |

History-maintenance flags require the existing suite. Prefer suite-level selection over
ad-hoc filters; perceived filtering has limitations. For exact single-test diagnostics,
preview the relevant Playwright config with `--grep` and `--list` before execution.
Direct Playwright invocation bypasses runner setup/validation and is not a recorded campaign.

## Preconditions and backend setup

- Use normal **development** Kupua, with a windowed corpus. Leave
  `VITE_JUSTIFIED_PREVIEW` unset; synthetic/resident sample modes are not campaign backends.
- Keep the browser visible and unobscured. Freeze application/configuration files while
  measuring: Vite reloads invalidate a run, including reloads caused by documentation saves.
- Use matching app and runner modes. The runtime fingerprint checks mode/topology, browser,
  viewport, DPR and other environment fields. A descriptive label is not proof of topology.
- Keep the pinned date cutoff, viewport, media/cache conditions and workload consistent when
  comparing. The cutoff does not freeze edits or deletions in the live corpus.
- Do not change resource limits, safeguards, authentication or server configuration just to
  make a failing measurement pass. No non-local ES writes.

Start the appropriate app, in a separate terminal:

```bash
./kupua/scripts/start.sh --use-TEST
# OR, with local Grid/media-api already running:
./kupua/scripts/start.sh --use-media-api
# OR, using deployed TEST media-api:
./kupua/scripts/start.sh --use-deployed-media-api
```

Local API means browser → local Vite/proxy → local media-api → TEST ES tunnel, **not**
deployed TEST media-api. Deployed API mode still uses local thumbnail/image delivery.
Both API campaign flags select the authenticated HTTPS Kupua origin; direct ES normally
uses localhost. Origin/proxy differences prevent treating every timing delta as API overhead.
The [application setup guide](../README.md#quick-start) owns broader infrastructure instructions.

For a **new/changed API setup or changed measured paths**, validate before recording:

```bash
npm --prefix kupua run test:perf -- --use-media-api --long-perceived-only --dry-run --runs 2 --label "API setup check"
```

Use the deployed flag instead when appropriate. Local media-api must have the reviewed TEST
`field.aliases` configuration: otherwise alias-backed metadata and filters can silently differ.
Where local setup uses `~/.grid/common.conf`, copy only the reviewed alias block, not an entire
TEST configuration, then restart media-api. For traversal, buffering or selection changes, also run the relevant focused jank dry checks
from [the rendering spec](perf.spec.ts). Preflights are **not** required before every repeat
campaign on an unchanged, already-validated setup.

### Authentication state

Playwright storage state contains live credentials. **Create and retain the real JSON outside
the repository**, with private permissions. Do not print it, paste it into chat, copy it into
Kupua or commit it. Interactive login is performed by the operator, not an agent.

```bash
mkdir -p "$HOME/.config/kupua-playwright"
chmod 700 "$HOME/.config/kupua-playwright"
kupua/node_modules/.bin/playwright codegen \
  --save-storage="$HOME/.config/kupua-playwright/panda-auth.json" \
  https://kupua.media.local.dev-gutools.co.uk
```

Sign in to [local Grid](https://media.local.dev-gutools.co.uk/) for local API mode, and to
[TEST Grid](https://media.test.dev-gutools.co.uk/) for deployed API/satellite services.
Cookies are domain-scoped; localhost cannot supply the authenticated local/TEST domains.
Close the codegen browser to write the state, then create the ignored symlink the runner expects:

```bash
chmod 600 "$HOME/.config/kupua-playwright/panda-auth.json"
ln -s "$HOME/.config/kupua-playwright/panda-auth.json" kupua/e2e-perf/.panda-auth.json
git check-ignore -q kupua/e2e-perf/.panda-auth.json
```

Do not overwrite an existing path blindly. An ignored regular credential file inside the repo
is **not** an acceptable substitute for the external file. Authentication failures/redirects and
empty authenticated responses invalidate the campaign; renew the private state rather than
interpreting them as latency. Remove only the symlink when finished if it is no longer needed.

## Density comparisons and thumbnail exposure

The comparison suite covers scrolling with browser-cache bypass and repeat-path setup,
Table→image-layout switching, detail return, scrubber seek, width reflow and window eviction.
It retains one paired source identity and rotates density order between repetitions.

Normal workloads and all startup/setup are **unthrottled**. One automatically included
constrained-scroll family runs across Grid, Justified and Table: 80ms latency, 4Mibit/s download,
1Mibit/s upload, only during its four-second observation window. It constrains page requests,
including possible data refills—not just thumbnail bytes. There is no separate throttle flag.

Scroll observations use a time-based animation-frame loop at 1,200px/s, with achieved movement
recorded. This is not physical wheel-device certification. The normal viewport is 1720×960,
DPR2; width-reflow cases temporarily narrow it. Eviction is an event-bound workload, not a
constant-speed comparison. Browser-cache bypass does not clear already-loaded images or reset
proxy/CDN/server caches. Repeat-path setup does not guarantee every resource is warm.

### Reading the measurements

- `t_ack` — synchronous action acknowledgement by its current producer; not a DOM-visible boundary.
- `t_first_visible_frame` — the target context has real visible content in a browser frame;
  this is not necessarily decoded media or final settled geometry.
- **Placement and visible-media completion share a start clock.** Do not add them together.
  Stable geometry is not decoded media, and decode readiness is not exact compositor paint.
- **Positive lead distance:** ready before entering the viewport. **Negative:** already inside.
  Initially ready images do not invent readiness events; missing samples are not zero latency.
- Pending-thumbnail area is a **viewport-area estimate**, not a per-image speed ranking.
  Justified shows more imagery; Table has a narrow thumbnail column. Keep missing result data,
  failed media and still-pending thumbnails separate.
- Layout-shift sums/attributed source nodes are not automatically official CLS or proof of
  thumbnail causality. Repainting and virtualized element reuse are not logical reordering.
- Four repetitions give four samples per scenario, not four historical campaigns. Their p95
  is the slowest repetition, not a reliable population-tail estimate. One campaign is a baseline,
  not a trend; compare matched contracts within an environment before drawing wider conclusions.
- Resource Timing reports completed browser transfers, not pending requests or backend ES work.
  RTT is a separate probe to `KUPUA_ES_URL` (default localhost:9220), **not API latency**; verify
  its target/reachability before interpreting it. `KUPUA_PERF_BASE_URL` overrides the direct-mode
  browser origin; API flags select their authenticated origin. `CPU_THROTTLE` is an explicit
  diagnostic setting and must match for comparisons.

### Coverage limits

The recorded pre-seam direct-ES and media-api campaigns cover seek-regime outcomes, not
controlled transport overhead, near-threshold indexed construction, continuous resize,
the <600px target-height transition or aggregate heap. Dimension/cardinality bounds do not
certify frame time or total JS/typed-array/WASM retention; see the
[geometry cost model](../exploration/docs/00%20Architecture%20and%20philosophy/03-scroll-architecture.md#bounded-justified-geometry-costs).
Held maintenance and page-size checks do not establish natural-scroll request frequency.

When a comparison is warranted, a matched four-repetition density campaign is the smallest
useful comparison: hold corpus, backend, regime, width and cache/network profile comparable,
with Grid controls. Packing changes which images occur per pixel; media differences are not
packing-algorithm timings. A scalar seek-policy extraction does not itself justify a new
campaign or a performance claim. Campaigns and dry runs remain separately approved work.

## Dashboards and reports

Open the dashboard links above directly from disk; no server is required. They load local JS
sidecars beside the HTML. Refresh after a campaign. All three provide Previous/Next controls,
arrow-key metric navigation and metric explanations; arrows stay native in editing controls.

The density dashboard defaults to latest comparison cards. History connects compatible samples
only, and explicitly distinguishes single points, gaps and zeros. Hover/focus/tap provides values
and sample counts; Escape dismisses. Advanced filters/raw diagnostics are collapsed. Scales are
shared within each workload; unrelated workloads can use different scales. The older dashboards
retain their own comparable-history filters. Do not ignore unknown-field/schema warnings.

The runner prints a unique `$TMPDIR/kupua-perf-<timestamp>-<pid>.log` path and stores its location
in ignored `results/.latest-report-path`. Cleanup progress helps distinguish a running teardown
from a stalled test. Requested histories are committed **only after every selected repetition
and suite succeeds**. Failures retain diagnostics, not partial benchmark history or resumable
checkpoints. The density suite fails fast; do not fix failures by relaxing assertions/timeouts.

## Local validation

These are safe local checks, not live campaigns:

```bash
npm --prefix kupua run test:perf-harness
npm --prefix kupua run test:perf-fixtures
npm --prefix kupua run test:perf-app
```

They cover pure parsing/reporting contracts, synthetic browser/dashboard behaviour, and the
actual app with in-memory data in indexed/seek modes. The app-backed check requires **port3041
free**, starts its own isolated frontend and blocks external/service HTTP. It uses no live API
or ES and writes no benchmark history. Synthetic observer tests alone do not prove app setup.

## Maintaining measurements

<a id="measurement-discipline-for-later-work"></a>

Keep setup, measured action and cleanup separate. Require the correct identity/state and an
observable completion boundary; fixed sleeps are not proof. Missing phases/records or changed
conditions must not silently shrink a sample. Version changed workloads and preserve history.
Never persist credentials, raw live identities/URLs, request bodies or unredacted traces.
Do not import Vite-only modules into Node-executed specs; use browser-side access where needed.

Density selection shares only the [exact-button/pressed-state guard](../e2e/README.md#density-selection-guard).
Keep its caller-owned clicks and waits inside their existing observation windows: the density
Table-transition epoch precedes selection, and P4 includes the ordinary helper's existing
restoration/results/cooldown waits. The extraction adds a Node Promise continuation but no
browser command or shifted boundary; unchanged operation order is not measured latency parity.
No workload revision or campaign follows from this extraction alone.

| Need | Owning reference |
| --- | --- |
| Current cases and readiness contracts | [Rendering](perf.spec.ts), [short responsiveness](perceived-short.spec.ts), [journeys](perceived-long.spec.ts), [density](density.spec.ts) |
| Metric/schema/aggregation rules | [Harness validation](harness-validation.mjs), [density reporting](density-reporting.mjs), [perceived metrics](perceived-metrics.mjs) |
| Trace producers and developer opt-in | [Perceived trace module](../src/lib/perceived-trace.ts) |
| Thumbnail observer definitions/limits | [Thumbnail probe](thumbnail-probe.mjs) |
| Functional proof discipline | [E2E guide](../e2e/README.md#continuity-slice-discipline) |
| Justified decisions and campaign evidence | [Justified plan](../exploration/docs/justified-density-prototype-plan.md) |
| Optional experimental probes | [Experiments spec](experiments.spec.ts), [experiment results guide](results/experiments/README.md) |

Experiments are separate, manually supervised diagnostics—not included in `--full`. Reuse their
methods selectively; do not turn experimental private hooks or weak readiness checks into
benchmark guarantees. Larger helper consolidation is a separate task.
