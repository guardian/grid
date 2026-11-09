# Android Chrome Performance Measurement

A small, explicit research toolkit for diagnosing scrolling on a physical Android
phone. This is not a benchmark campaign, an automatic optimizer or a historical
baseline collection. Nothing here is imported by the application or selected by
ordinary E2E/performance campaigns.

Start with the [mobile measurement handbook](../../../exploration/docs/browser-playbook/mobile-performance.md)
for permission, identity, interpretation and cleanup rules. The
[Scrubber case study](case-study.md) illustrates the method, including a rejected
optimization. Its aggregate results are explanatory, not future performance targets.

## What Is Kept

- [capture.mjs](capture.mjs): bounded native recording and a configuration-only check. It sends
  no gestures, attaches no debugger and changes no phone settings or services.
- [analyze.py](analyze.py): offline renderer-cost/source attribution and optional inertial
  movement analysis. Output contains allowlisted aggregates and numeric source
  offsets, not source URLs, image data or arbitrary trace arguments.
- These guides and small synthetic self-checks embedded in the tools.

No old recordings, exported event dumps, built bundles, credentials, browser
profiles, downloaded binaries or investigation-specific counterfactuals belong
in this directory. Capture/export describe capabilities for new investigations,
not artifacts to preserve in Git.

## Prerequisites

- Node.js 22 or newer; Python 3.10 or newer. Both tools use standard libraries only.
- An authorized physical Android device, `adb`, and a verified foreground Chrome
  app/PWA. Authorization is required for each live-system session.
- The official Perfetto `trace_processor_shell`, installed outside this repository.
  Obtain it from the [official instructions](https://perfetto.dev/docs/quickstart/trace-analysis)
  and verify its published checksum. The SQL was exercised with Perfetto v59.1;
  future releases/browser schemas require a capability check, not silent fallback.
- For renderer events, the intended Chrome channel may need its Perfetto tracing
  flag enabled and a coordinated relaunch. Record the original setting first.

The recorder needs `adb`; the analyzer needs the trace processor. `--help`,
`--check-config` and `--self-test` do not access either device or live services.
Put the verified trace processor on `PATH` as `trace_processor_shell`, or set
`TRACE_PROCESSOR_SHELL` to its absolute path. `--trace-processor` can override it.

Set the command variables from the current session, not from historical examples:

| Variable | Value to supply |
| --- | --- |
| `PRIVATE_TRACE` | Private trace path printed by the recorder |
| `RENDERER_PID` | Independently verified renderer PID from discovery |
| `SERVED_SCRIPT_URL` | Exact relevant served module/bundle URL, without credentials/query/fragment |
| `ACTUAL_DPR` | `devicePixelRatio` read in the authorized foreground page |

## Workflow

### 1. Define the Question and Freeze the Workload

Name the suspected cost, one intervention and an outcome that would reject it.
Record the actual backend/data mode, app build, browser/channel, foreground state,
density/zoom, viewport/results dimensions, DPR and resource readiness. Keep query,
sort, image workload and placement policy equivalent across arms.

Prefer normal production builds for application-cost attribution. Vite/non-hosted
builds are supported measurement targets, but include development overhead and
transformed source locations. Never compare DEV and production as though only the
optimization changed. Do not restart a server or change a running campaign's mode.

Use the authorized app's remote DevTools to verify the loaded code and renderer
PID. Do not dump unrelated tabs, cookies, request headers or the full runtime
configuration. A disk build is not proof that the installed app loaded it. Where
CDP is used, `Page.reload` with `ignoreCache: true` followed by an expected-build
check is stronger than navigating to the same URL.

For source attribution, identify the exact served JavaScript URL privately. A
hosted bundle and a Vite module are both valid filters; generated offsets are not
automatically original TypeScript positions. Keep its matching build/source
available locally during the investigation, not as committed generated assets.

### 2. Check the Recipe Without Touching the Phone

Run from the repository root:

```sh
node kupua/e2e-perf/research/mobile-perf-measurement/capture.mjs --package com.chrome.beta --check-config
```

The package is an explicit target, not an assumption that every phone uses Beta.
Verify the intended Chrome producer registers with Android Perfetto before using
renderer mode. A WebView producer is not evidence that the intended browser works.

Default renderer recording filters debug arguments. Add `--sources` only when
callback source offsets/scheduler arguments are needed: raw typed fields can
contain private URLs even with Chrome privacy filtering enabled.

### 3. Preflight Sources, Then Capture

Only after session permission and foreground/build verification:

```sh
node kupua/e2e-perf/research/mobile-perf-measurement/capture.mjs --package com.chrome.beta --sources --preflight --record
```

This is a one-second source check, not a performance sample. The JSON result gives
an approved-private temporary trace path. Raw output and stderr are created outside
the checkout with private permissions; failed/partial captures are retained and
explicitly marked unsuccessful.

List candidate renderers offline, using that private trace:

```sh
python3 kupua/e2e-perf/research/mobile-perf-measurement/analyze.py --trace "$PRIVATE_TRACE" --list-renderers
```

Candidate PIDs/counts do not identify the app by themselves. Match the authorized
foreground renderer independently; do not choose the busiest thread automatically.
An optional `--source "$SERVED_SCRIPT_URL"` on this command adds target-script
callback counts without printing the URL; multiple tabs can still share that script.
Check source positions are actually present before spending a full gesture window.

Then record the named workload:

```sh
node kupua/e2e-perf/research/mobile-perf-measurement/capture.mjs --package com.chrome.beta --seconds 20 --sources --record
```

The recorder sends **no swipes**. Agree who drives and provide an explicit start
cue. Prefer physical input for a physical-touch symptom. If independently driving
ADB gestures, validate physical screen coordinates against the real results area,
verify the foreground target, bound the sequence and retain its timings. Injected
input does not establish hardware finger-contact timing. No old phone coordinates
or build-specific driver is retained here.

`--profile frames` selects only FrameTimeline when renderer/source attribution is
not needed; analyze it with `--frames-only --package` rather than renderer selection.
For example:

```sh
python3 kupua/e2e-perf/research/mobile-perf-measurement/analyze.py --trace "$PRIVATE_TRACE" --frames-only --package com.chrome.beta
```

The maximum capture is thirty seconds; start small and reduce sources
if integrity checks fail. Do not add CPU profiling, network collection, screenshots
or a page frame loop by habit.

### 4. Attribute Costs Offline

```sh
python3 kupua/e2e-perf/research/mobile-perf-measurement/analyze.py --trace "$PRIVATE_TRACE" --renderer-pid "$RENDERER_PID" --source "$SERVED_SCRIPT_URL"
```

The report includes source coverage, trace integrity, main-thread phase costs and
the nearest JavaScript callback for layout/style operations that have one. The source filter labels
matches without returning its URL. Do not pass signed/media URLs or credentials.

Main-task time is a wall-time union, not CPU time. Phase costs exclude overlapping
selected descendants; their sum is not a sum of inclusive React/trace durations.
The source-attribution table is explicitly inclusive and must not be added to
those phase totals. An expensive callback can be paying for layout dirtied by
another component; inspect both the reader and preceding writers.

If `--sources` was omitted or the browser withheld arguments, absent source
positions mean unavailable attribution, not cheap JavaScript. React component
ownership may need a separate CPU sample or production profiling build; normal
production Profiler timings are not guaranteed to exist.

For a motion-specific question, additionally request:

```sh
python3 kupua/e2e-perf/research/mobile-perf-measurement/analyze.py --trace "$PRIVATE_TRACE" --renderer-pid "$RENDERER_PID" --package com.chrome.beta --motion --dpr "$ACTUAL_DPR"
```

This uses recorded gesture IDs/inertial phases, not fabricated contact edges.
It excludes dropped/zero display tokens, verifies presentation associations and
separates gaps with intervening display updates from gaps in display delivery.
The threshold follows recorded vsync cadence; it is not a universal 25ms rule.
Consumed movement is device-scaled, or CSS-equivalent when an actual DPR is given.
Neither input deltas nor these joins independently prove which pixels changed.

Missing required tables, markers or fields fail visibly. Never repair a capture
by weakening count, clock or presentation checks until it passes.

### 5. Test One Change and Close the Loop

Use a narrowly scoped, reversible counterfactual before a production change when
causality is unclear. Preserve geometry, visibility/readiness, data publication,
selection/focus and actual work. Verify the probe's own restoration and visual
equivalence separately. A counterfactual is not ordinary production evidence.

Compare the production change without the probe, including costs that might have
moved elsewhere. Keep subjective reports, numeric witnesses and invalid captures
separate. Run the required behavior gates for production changes. Stop when the
question is answered; there is no requirement to produce an optimization.

Close profilers/debugger forwards, remove owned overrides and release input.
Restore the recorded tracing-flag setting and coordinate relaunch. Keep raw files
only for the agreed private retention period; never move them into this checkout,
including ignored folders. Review even aggregate reports before committing them.

## Offline Checks and Campaign Separation

```sh
node kupua/e2e-perf/research/mobile-perf-measurement/capture.mjs --self-test
python3 kupua/e2e-perf/research/mobile-perf-measurement/analyze.py --self-test
```

These use synthetic inputs, no browser, `adb`, trace processor, servers or services.
They check the toolkit, not a device's tracing capabilities.

Keep a campaign's application/build and checkout frozen. A separate worktree
isolates edits but not CPU/GPU load: defer competing tests, captures and rebuilds
until active measurements finish. This kit never starts a campaign or restarts
application infrastructure.