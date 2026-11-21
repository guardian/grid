# Mobile Performance Diagnosis

[Mandatory browser safeguards](../embedded-browser-playbook.md) apply throughout.
These are bounded diagnostics, not permission to run [performance campaigns](../../../e2e-perf/README.md).
Keep device state, run results, hypotheses and next-session tasks in the owning
investigation or session handoff, not this handbook.

The [Android Chrome measurement kit](../../../e2e-perf/research/mobile-perf-measurement/README.md)
provides explicit recording/offline-analysis commands and setup instructions.

## Choose the Measurement

| Question | Evidence | Limitation |
|---|---|---|
| Is the symptom phone-specific? | Actual phone and native finger input; later an equivalent desktop journey | Desktop touch emulation does not reproduce phone CPU/GPU/display behavior. |
| Are pictures arriving late? | Sanitized request waterfall plus current-visible resource/readiness tracking | Download completion is not decode or paint; browser timing is not backend CPU. |
| What occupies the renderer? | Chrome task/lifecycle events and sampled CPU stacks | Callback attribution includes triggered work; nested inclusive durations cannot be added. |
| When did the finger lift? | Native touchscreen contact edges | Generic input-processing slices need not identify DOWN/UP. |
| Are frames late or work delayed? | Android FrameTimeline and scheduling/wakeup events | Jank labels are not counts of perceived hitches or proof of their cause. |
| Does observation change behavior? | Repeated trace-free/instrumented controls and independent subjective reports | A smooth recording alone does not establish an observer effect. |

Long-task/LoAF thresholds miss shorter overruns at high refresh rates. INP is not
a continuous-scroll metric; requestAnimationFrame cadence is not physical frame
presentation. Prefer individual adverse episodes and cadence to average FPS.

## Establish Identity and Conditions

- Confirm backend permission, read-only scope, actions and time bounds.
- Record installed-app versus ordinary-tab context, browser/OS, foreground state,
  viewport, DPR, container dimensions, query/sort, density and zoom.
- For browser-channel controls, compare the same display mode and measured geometry.
  An Android Chrome control labelled Text size can change effective DPR and layout,
  not just fonts. Verify the resulting DPR/viewport instead of assuming equivalent
  defaults or interpreting the label as font-only scaling; match address-bar position
  too when practical, because browser controls can change the available viewport.
- Distinguish build identity, API topology and media delivery. A [local hosted build](../00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md)
  removes development-runtime overhead without remote deployment, but switching
  from Vite also changes configuration/transport: it is not an isolated React-mode test.
- Rebuilding does not replace JavaScript in an already-loaded installed app. Verify
  its loaded bundle after reload, not only disk output. A normal reload can reuse
  stale HTML; coordinate a cache-bypassing reload when necessary and verify again.
  For CDP, use `Page.reload` with `ignoreCache: true` and assert the expected loaded
  bundle after readiness. Same-URL `Page.navigate` is not proof that the document
  was refreshed. If identity disagrees, compare safe asset basenames from a
  no-store HTML read with loaded scripts; never return the full HTML or private URLs.
  Do not clear authentication or preferences to accomplish this.
- Origins can have separate preferences. Do not assume Chrome offers coexistence
  of installed apps, or delete an installation automatically.
- A `data:`/out-of-scope control can add browser chrome and shrink the viewport even
  while display-mode still reports standalone. Verify actual clipping/geometry before
  comparison. A fresh same-origin diagnostic document can preserve the shell; scope
  any temporary document fulfillment to one owned request, use no-store, remove its
  interceptor before measurement and verify the normal app after restoration.
- Home obtains fresh first-page data and resets search state; it is not merely
  scrolling to zero. Record content/publication changes. Unvisited images are not
  certified cold browser, decoded, proxy or CDN cache.
- Keep power, thermal and display settings stable initially. Test refresh-policy
  changes separately; do not combine them with code changes or GPU overrides.

## ADB and Chrome Attachment

Check authorization without logging device serials. Inspect reverse mappings before
changing them. The HTTPS reverse mapping carries application traffic; it is not a
disposable debugger forward. API 401s with successful module loads indicate rejected
authentication, not automatically a broken mapping or tracing flag.

Discover the intended Chrome socket and allocate an owned forward:

```sh
adb forward tcp:0 localabstract:chrome_devtools_remote
```

Multiple Chrome channels/app contexts can expose a numbered socket such as
`chrome_devtools_remote_<pid>` as well as the default. Discover current Chrome socket
names in `/proc/net/unix` and verify `/json/version` or `Browser.getVersion` before
attributing a page to a channel. A timeout on the default endpoint does not prove
the foreground channel is unavailable. Rediscover numbered sockets after restarts;
do not hardcode an old PID. Native Perfetto tracing enablement is separate from
this CDP connection; leave it unchanged for a trace-free comparison.

Inspect `/json/list` locally through the returned port. Filter authorized origins
before inspecting pages; never print other tab titles/URLs. Select the visible,
focused, correct-build target and stop searching once found. Frozen background
tabs can time out independently. Close CDP and remove only the owned forward:

```sh
adb forward --remove tcp:PORT_RETURNED_ABOVE
```

Do not remove the HTTPS reverse mapping to disconnect profiling. Avoid running
network, screenshots, frame observers and CPU profiling together by default.
Keep screen mirroring off unless its overhead is part of the experiment.

## Native Chrome Tracing Flag

FrameTimeline availability does not prove Chrome renderer tracing is enabled.
Check the producer: unrelated Chromium WebViews also advertise `track_event`.
On ordinary Android builds, the intended Chrome channel may require:

1. Open `chrome://flags/#enable-perfetto-system-tracing`.
2. Record the original value, select **Enabled**, and coordinate **Relaunch**.
3. Return to the app; recheck authentication, build and settings.
4. Verify the intended Chrome producer registers renderer events.

A Chrome Beta registration check can filter locally:

```sh
adb shell perfetto --query | rg 'track_event.*org[.]chromium-com[.]chrome[.]beta-'
```

Rediscover sources/PIDs after relaunch. A Chrome producer can cover background pages;
establish the relevant renderer rather than assuming the busiest thread owns the app.
If the flag is absent, check current browser support rather than guessing a replacement.

**After profiling:** restore the flag's recorded original value, normally **Default**,
and **Relaunch**. **Disabled** is an explicit override when the operator wants it off.
Stopping a trace or removing a forward does not reset the flag. Put any pending
flag reset in the session handoff, not as device-specific state in this handbook.

## Capture Recipes

Start with the smallest useful source. For example:

```textproto
buffers { size_kb: 4096 fill_policy: RING_BUFFER }
data_sources { config { name: "android.surfaceflinger.frametimeline" } }
duration_ms: 20000
```

A bounded collector can supply text configuration on stdin to
`adb shell -T perfetto --txt -c - -o -`, collecting binary stdout separately from
stderr into approved private storage. Bound elapsed time and bytes; check exit status.

For renderer attribution, assign frames/process metadata, scheduling and Chrome
events to separate buffers via `target_buffer`. Scope `track_event` to verified
Chrome producers, enabling only needed categories such as `toplevel`,
`devtools.timeline`, `disabled-by-default-devtools.timeline`, `blink`, `cc` and `v8`.
Enable Chrome privacy filtering and filter debug annotations/dynamic event names;
typed arguments may still contain private strings, so raw output remains private.

Add `sched/sched_switch`, `sched/sched_waking` and a process/thread census for
scheduling attribution. Frequency counters can help; CPU-idle and broad vendor/atrace
categories can dominate volume. Reduce sources, separate buffers or shorten captures
when loss occurs rather than repeatedly asking for larger recordings. Preflight that
the requested renderer events actually appear before a full gesture sample.

For JavaScript attribution, a bounded CDP `Profiler` session can sample stacks
without page frame loops or network collection. Set the sampling interval explicitly,
stop/disable in `finally`, sanitize source origins/queries and detach. This measures
code costs under observation, not uninstrumented performance.

### Native Finger-Lift Timing

Discover touchscreen capabilities using `getevent -lp`; do not copy a device number
from a previous session. A bounded `timeout`/`getevent -lt` reader can retain only
contact DOWN/UP timestamps, discarding coordinates, unrelated devices and key data.
Check byte count, parsed/unknown events and exit status; an intentional timeout can
be expected, but zero edges requires investigation.

Launch concurrent collectors as child processes in one host program and verify
start/end overlap. Do not parallelize terminal tool calls into a shared shell:
they can interrupt a live command or interleave input. Inspect logs with read-only
file tools while it runs, and wait for completion before new terminal work. A large
output resource can contain an active execution ID, not a completed result; read
its header. Use
`clock_snapshot` to map native MONOTONIC input timestamps into the trace clock,
commonly BOOTTIME; never subtract incompatible raw clocks. Cross-check against
native input delivery where available. Distinguish lift, later touch interruption,
frame start and frame end/presentation.

## Validate and Interpret

- Check duration, service start/stop markers, source coverage, overwrites, discarded
  chunks, kernel overruns and parser errors. Severity filters alone can miss
  informational `traced_buf_bytes_overwritten` and chunk counters.
- Missing process metadata is not absent application work. Retained clock-aligned
  windows can support narrower observations without certifying the whole capture.
  Preserve adverse/partial samples and unexplained discard counters explicitly.
- `trace_bounds` may include historical process metadata. Use service markers such
  as `tracing_started_ns`, `all_data_source_started_ns`, `tracing_disabled_ns` and
  actual event windows when defining the observation boundary.
- Non-animating frames are not deadline misses. Buffer stuffing can coexist with
  smooth/on-time presentation. Dropped display records are not perceived-hitch counts.
- App actual-timeline ends represent GPU/post completion, not on-screen presentation.
  Join to SurfaceFlinger actual records by `display_frame_token` when measuring display
  intervals. Dropped records can carry repeated token `0`: retain their classifications
  but exclude them from presentation joins; require real tokens to be unique within
  the chosen display context. Validate row counts against the same selected-surface
  predicate, retaining whole-trace and excluded totals separately.
- Regular frame delivery does not establish regular movement or changed pixels. For
  repeated-position/uneven-motion reports, compare presentation-associated scroll
  updates and visual offsets, not FPS alone. If supported, preflight
  `chrome.scroll_jank.scroll_offsets` and the required numeric events. Some Chrome
  builds expose `EventLatency` through `input.scrolling` without broad `cc` tracing;
  verify actual categories/populations rather than assuming the larger trace is needed.
- The standard presented-offset table associates input deltas with presentation; it
  is not an independent pixel-equality witness. Compare provided versus visual/unused
  deltas and check coalescing/origin changes. Device-scaled pixels are not CSS pixels,
  and integer visual-offset repeats near subpixel motion are not automatically hitches.
- Verify which Chrome metric an exported jank flag represents; a generic `is_janky`
  column does not necessarily mean V4. Cross-check event IDs and motion phase against
  measured gaps, not just flag totals. A flag is not a perceived-hitch count, and a
  missing field in a scoped query/export does not establish runtime feature state.
- An oversized aggregated step followed by an on-time display update without distinct
  movement can escape deadline-miss metrics. Verify original delta sums, event IDs and
  timing against smooth controls; counting coalesced inputs alone does not establish jank.
- A presentation after lift can still contain queued finger-down inputs. Classify
  both interval endpoints and the continuous-motion phase before calling a gap an
  inertial-tail episode; keep cadence changes, phase crossings and idle gaps separate.
- Callback duration can include React microtasks and nested layout. CPU estimates
  are sampled; DEV JSX costs are not production costs. Minified offsets and
  Vite-transformed lines require mapping before citing original TypeScript.
- Request machine-readable analyzer output explicitly, such as `--format csv`;
  agent mode may otherwise emit truncated Markdown. Parse structurally and verify
  exported counts before discarding raw evidence.
- Ask how the journey felt before interpreting it. Keep smooth references, symptom
  reproductions and invalid captures distinct; do not infer probe causality from absence.

## Privacy and Restoration

Never store raw traces/HARs, credentials, signed URLs, image identities or metadata
under the public repository, including ignored directories. Obtain permission for
private temporary storage outside it, restrict permissions, analyze locally and do
not upload. Sanitize in memory; retain necessary timings/classifications/source paths
without origins or queries. After verifying useful exports, delete raw data unless
private retention has been explicitly authorized. An atrace
field named `cookie` may be a correlation ID, not an HTTP cookie; inspect context.

Stop traces/profilers, terminate owned readers, release input, remove listeners/marks/
overrides, close CDP and remove owned forwards. Do not kill unrelated processes or
restart servers/tunnels as cleanup. Check the Chrome flag separately.

For build-time counterfactuals, back up exact baseline assets, fail closed on changed
source shape, validate both arms and state functional trade-offs. Removing functional
work is not an equivalent performance comparison; establish which responsibilities
the intervention changes. Restore assets and verify the actual loaded bundle and
absence of controls after fresh reload. Preserve user edits; do not commit experiments.

## Selecting Further Tests

Review existing evidence and its limits before choosing another measurement. Name
one unanswered question, one intervention and a result that would disprove the
hypothesis. Match actual work and readiness; vary order where cache or sequence
effects could explain a difference. Stop when the named question is answered.

Views that share rendering or scrolling infrastructure are not independent controls.
Separate data refresh, retained revisits, resource arrival, publication and ongoing
motion when interpreting costs. A cheaper trace is useful only when required
behavior remains correct.

Keep observations distinct from causal claims. Attributing a limitation to an
application, browser or device requires an isolating control, relevant environment
and version evidence, and tested practical mitigations. Missing instrumentation or
an unexplained result does not establish where the limitation belongs.

References: [Chrome tracing](https://perfetto.dev/docs/getting-started/chrome-tracing),
[FrameTimeline](https://perfetto.dev/docs/data-sources/frametimeline),
[scheduling](https://perfetto.dev/docs/data-sources/cpu-scheduling),
[configuration](https://perfetto.dev/docs/reference/trace-config-proto).