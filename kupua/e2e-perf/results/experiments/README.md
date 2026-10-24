# Experiment Results

Each experiment run produces a JSON file: `exp-YYYY-MM-DD-HHMMSS.json`.

## Signals Glossary

Every experiment snapshot contains these signal groups. Understanding what
each number means is essential for interpreting results and deciding whether
a knob change is an improvement.

### CLS (Cumulative Layout Shift)

| Signal | Unit | Meaning | Good | Bad |
|--------|------|---------|------|-----|
| `cls.total` | ratio | Sum of all unexpected layout shift scores (shifts without recent user input). Measures visual stability — did elements jump around? | < 0.01 | > 0.1 |
| `cls.maxSingle` | ratio | Largest single layout shift event. A high value means one big jarring jump happened. | < 0.005 | > 0.05 |

### LoAF (Long Animation Frames)

Chrome 123+ only. Measures main-thread blockage — the browser couldn't
paint because JS was hogging the thread.

| Signal | Unit | Meaning | Good | Bad |
|--------|------|---------|------|-----|
| `loaf.count` | count | Number of long animation frames (>50ms). Each is a moment the UI was unresponsive. | 0–3 | > 15 |
| `loaf.totalBlockingMs` | ms | Total blocking time across all LoAFs. The cumulative tax on responsiveness. | < 50 | > 500 |
| `loaf.worstMs` | ms | Duration of the single worst long animation frame. | < 80 | > 200 |

### Jank (Frame Timing)

Measured via `requestAnimationFrame` deltas. Every gap between frames is
recorded. "Severe" frames are ones where the gap exceeds 50ms (dropped
frame at 60fps).

| Signal | Unit | Meaning | Good | Bad |
|--------|------|---------|------|-----|
| `jank.frameCount` | count | Total frames recorded during the scenario. Context signal — more frames = longer measurement window. | — | — |
| `jank.severe` | count | Frames with >50ms gap (i.e. at least one frame drop). The primary jank signal. | 0 | > 10 |
| `jank.severePerKFrames` | rate | Severe jank normalised to per-1000-frames. Directly comparable across speed tiers regardless of measurement duration. | 0 | > 50 |
| `jank.maxFrameMs` | ms | Worst single frame gap. A 200ms gap means ~12 dropped frames at 60fps — visible stutter. | < 50 | > 200 |
| `jank.p95FrameMs` | ms | 95th percentile frame gap. If this is high, jank is widespread (not just one spike). | < 20 | > 50 |
| `jank.avgFrameMs` | ms | Mean frame gap. At 60fps, ideal is ~16.7ms. Context signal — affected by idle time. | ~16 | > 30 |

### DOM Churn (Mutation Observer)

Counts all DOM mutations (node additions + removals + attribute changes)
during the scenario. High churn means the virtualizer is doing lots of
work recycling rows.

| Signal | Unit | Meaning | Good | Bad |
|--------|------|---------|------|-----|
| `dom.totalChurn` | count | Sum of adds + removes + attribute changes. Lower = less layout/style recalculation work. | < 500 | > 10k |

### Scroll Velocity

Measured per-frame as `|Δ scrollTop| / Δtime`. Provides context for
interpreting jank — fast scroll triggers more extends and virtualizer
recycling.

| Signal | Unit | Meaning | Good | Bad |
|--------|------|---------|------|-----|
| `scroll.maxVelocity` | px/s | Peak scroll speed during the scenario. Context for comparing runs — were scroll speeds similar? | — | — |
| `scroll.avgVelocity` | px/s | Mean scroll speed. Context signal. | — | — |
| `scroll.samples` | count | Frames where scroll movement was detected. Low sample count means the container barely moved. | — | — |

### Blank Flashes (Intersection Observer)

Detects rows that enter the viewport blank (no `<img>`, no text) and
later get content. Each flash is a moment where the user sees an empty
placeholder instead of content.

| Signal | Unit | Meaning | Good | Bad |
|--------|------|---------|------|-----|
| `flashes.count` | count | Rows that entered the viewport without content and later received it. | 0 | > 10 |
| `flashes.totalDurationMs` | ms | Cumulative time rows spent visible-but-blank. | 0 | > 500 |
| `flashes.maxDurationMs` | ms | Longest single blank flash. > 100ms is perceptible to users. | 0 | > 100 |
| `flashes.pendingCount` | count | Rows still blank when measurement ended. Non-zero means the scenario ended before content arrived — likely a bug or extreme scroll speed. | 0 | > 0 |

**Note:** Flashes may read 0 if the virtualizer's overscan is large enough
that rows always have content before entering the visible viewport, or if
the scroll speed was insufficient to outrun prefetching. A 0 is genuine
good news, but the probe self-test (logged to console) will warn if the
IntersectionObserver never fired at all — which would indicate a setup
problem rather than a real zero.

### Network (ES Requests)

Tracks fetch requests to the ES proxy (`/es/`).

| Signal | Unit | Meaning | Good | Bad |
|--------|------|---------|------|-----|
| `network.requestCount` | count | ES search/count requests during the scenario. More = more extends triggered. | — | — |
| `network.totalBytes` | bytes | Total transfer size. Lower is better for `PAGE_SIZE` and `_source.excludes` experiments. | — | — |
| `network.avgBytes` | bytes | Average bytes per request. Context signal. | — | — |
| `network.avgDurationMs` | ms | Average request duration. Dominated by SSH tunnel latency on TEST. | — | — |

### Scroll Speed Tiers (Scenario Context)

Experiments use named speed tiers so results are comparable across runs.
Calibrated to real mouse/trackpad behaviour — a standard mouse wheel notch
produces `deltaY ≈ 100px`, comfortable scrolling is 3–6 notches/sec.

| Tier | wheelDelta | intervalMs | Events (~5s) | Total delta | Simulates | Approx velocity |
|------|-----------|------------|-------------|-------------|-----------|----------------|
| `slow` | 100px | 300ms | 17 | ~1,700px | Browsing — looking at images while scrolling. | ~300 px/s |
| `fast` | 200px | 100ms | 50 | ~10,000px | Fast flick — power user, trackpad swipe. | ~2,000 px/s |
| `turbo` | 400px | 50ms | 100 | ~40,000px | Aggressive trackpad swipe. Pushes past buffer edge. | ~8,000 px/s |

Wheel counts are **duration-normalised** to ~5s per tier (`5000 / intervalMs`).
This ensures comparable frame counts across speeds and enough scroll distance
for `fast` and `turbo` to trigger multiple extends (extend threshold ≈ item 150
in a 200-item buffer → ~3,700px table, ~6,500px grid). `slow` deliberately
stays below the extend threshold — it measures the pure-browsing baseline.

### Smooth Autoscroll Speed Tiers (E6)

Simulates middle-click autoscroll (Firefox built-in, Chrome via extensions).
Unlike wheel events, this is **continuous rAF-driven scrolling** — a
`requestAnimationFrame` loop increments `scrollTop` by N pixels per frame.
This is exactly what the browser's native autoscroll does internally.

Key difference from wheel tiers: wheel events are discrete (the virtualizer
processes them in batches), while autoscroll is continuous (every frame has
a tiny scrollTop change, producing real scroll events from the browser engine).

| Tier | px/frame | Approx velocity | Simulates |
|------|---------|----------------|-----------|
| `brisk` | 20 | ~1,200 px/s | Scanning headings/thumbnails only. Mouse ~3cm below origin. |
| `fast` | 50 | ~3,000 px/s | Mouse far from origin — racing through results. |
| `turbo` | 100 | ~6,000 px/s | Push far past extend threshold. At 15s, scrolls ~90,000px — enough to exhaust a 1000-item buffer multiple times. |

`crawl` (1px/frame) and `gentle` (3px/frame) were dropped in v2 — they scroll
~900px / ~2,700px in 15s, nowhere near the ~4,800px (table) or ~7,500px (grid)
extend threshold. They produce uniformly smooth jank data with zero extends.

Each tier runs for **15 seconds** (up from 5s in v1) to exercise extend/evict cycles.

The key output from E6 is: **at what px/frame does severe jank appear?**
This tells you the exact speed threshold where the virtualizer can't keep
up with the scroll rate. The result JSON includes `actualPxPerFrame`
(may differ from target if the container hit its scroll limit) and the
actual frame count.

### Image Traversal Speed Tiers

For experiments E4 (image detail) and E5 (fullscreen), the traversal speed
controls how long the user stays on each image before pressing ArrowRight/Left.

| Tier | intervalMs | Simulates | Images per minute |
|------|-----------|-----------|-------------------|
| `fast` | 200ms | Rapid scanning — flicking through to find a specific image. | ~300 |
| `rapid` | 80ms | Holding down the arrow key. Tests cancellation — most images won't render. | ~750 |

`slow` (2500ms) was dropped — at that interval every image renders trivially;
it measures imgproxy latency, not app behaviour.

The key question at each speed: **did the image actually render before the user
moved on?** At `fast` speed (200ms interval), many images via imgproxy may NOT
render in time. At `rapid` (80ms), almost none will — the app should cancel
intermediate loads and only render the final image cleanly.

### Landing Image Timing (E4, E5)

**THE most important measurement in traversal experiments.** When a user flicks
through 20 images rapidly, the only image that matters is the one they LAND on.
This is measured separately from per-step timings with a generous 5s timeout.

| Signal | Unit | Meaning | Good | Bad |
|--------|------|---------|------|-----|
| `landingImage.alreadyRendered` | bool | Was the image already fully rendered when traversal stopped? (Cache hit or lucky timing.) | true at fast | — |
| `landingImage.renderMs` | ms | Time from traversal-stop until `<img>.complete && naturalWidth > 0`. 0 if alreadyRendered. | < 500 | > 2000 |
| `landingImage.rendered` | bool | Whether the image rendered within the 5s timeout. | true | false |

### Image Render Timing (E4, E5)

Traversal experiments record per-image timing data:

| Signal | Unit | Meaning | Good | Bad |
|--------|------|---------|------|-----|
| `srcChangeMs` | ms | Time from key press until `<img>.src` changed (React committed the new URL). | < 50 | > 200 |
| `renderMs` | ms | Time from key press until `<img>.complete && naturalWidth > 0` (image decoded + painted). | < 500 | > 2000 |
| `rendered` | bool | Whether the image fully rendered before the user moved to the next one. | true at slow/normal | false at fast is OK |
| `renderedCount` | count | How many of N images actually rendered. At slow speed, all should render. At fast, only the last 1–2. | N at slow | — |
| `swappedButNotRendered` | count | Images where React committed a new src but it didn't decode in time. Indicates wasted work if high. | 0 | > N/2 |
| `avgRenderMs` | ms | Average render time for images that DID render. Dominated by imgproxy + network. | < 500 | > 1500 |
| `maxRenderMs` | ms | Worst single image render time. | < 1000 | > 3000 |

## JSON Schema

```jsonc
{
  "runId": "exp-2026-04-01-143022",       // unique run identifier
  "timestamp": "2026-04-01T14:30:22.000Z",
  "commitHash": "25c5f4dc8",              // git HEAD at time of run
  "commitMessage": "Fix focus drift...",
  "dirty": true,                           // working tree had changes?
  "esSource": "local",                     // "local" (10k) or "real" (TEST/PROD)
  "esTotal": 10000,                        // total doc count
  "experiment": "E1-table-turbo-scroll",    // experiment identifier
  "config": {                              // knobs being tested
    "overscan_table": "8"                  // the value under test
  },
  "scenario": "table-turbo-scroll-30-wheels",
  "snapshot": {                            // full perf snapshot — see Signals Glossary above
    "cls": { "total": 0.0041, "maxSingle": 0.002 },
    "loaf": { "count": 3, "totalBlockingMs": 120, "worstMs": 89 },
    "jank": { "frameCount": 450, "severe": 12, "severePerKFrames": 26.7, "maxFrameMs": 198, "p95FrameMs": 34, "avgFrameMs": 14.2 },
    "dom": { "totalChurn": 42100 },
    "scroll": { "maxVelocity": 24000, "avgVelocity": 8500, "samples": 380 },
    "flashes": { "count": 14, "totalDurationMs": 280, "maxDurationMs": 48, "pendingCount": 0 },
    "network": { "requestCount": 8, "totalBytes": 1548000, "avgBytes": 193500, "avgDurationMs": 45 }
  },
  "storeState": {                          // buffer state after scenario
    "prependGeneration": 2,
    "forwardEvictGeneration": 3,
    "bufferOffset": 800,
    "resultsLength": 1000
  }
}
```

## How to compare experiments

Run the same experiment with different knob values. Compare the JSON files:
- `flashes.count` — lower is better (fewer blank flashes)
- `jank.severe` — lower is better (fewer >50ms frames)
- `jank.maxFrameMs` — lower is better
- `scroll.maxVelocity` — context (were scroll speeds comparable?)
- `network.totalBytes` — lower is better for PAGE_SIZE/SOURCE_EXCLUDES experiments

## Workflow for the agent

1. Record baseline: run experiment with current values
2. Modify source file (e.g. `overscan: 8` in ImageTable.tsx)
3. Wait for Vite HMR
4. Set env var: `EXP_OVERSCAN_TABLE=8`
5. Run same experiment
6. Revert source file
7. Compare JSON files
8. Write comparison to experiments-log.md

## Safety: Experiment Value Bounds

**The agent is free to propose and run experiments against TEST (with user
confirmation), but must respect these constraints:**

- **Never set PAGE_SIZE > 500.** A single 500-doc response is ~5–25MB
  depending on `_source.excludes`. Higher values can cause ES circuit
  breaker trips or OOM the browser tab. The safe range is 50–500.
- **Never set overscan > 50.** Overscan controls how many extra rows
  the virtualizer renders offscreen. Above ~50, the initial render
  dominates frame time and the browser becomes sluggish. Safe range: 1–30.
- **Never set BUFFER_CAPACITY > 5000.** Each image object is ~2–10KB
  in JS heap. 5000 images ≈ 10–50MB. Higher risks browser GC pauses
  and slow virtualizer `measureElement` sweeps. Safe range: 500–3000.
- **Never set EXTEND_THRESHOLD > BUFFER_CAPACITY / 2.** Threshold ≥
  half the buffer means every extend triggers the next one immediately,
  creating a request storm.
- **Never set wheel delta > 5000 or interval < 10ms.** These produce
  synthetic scroll speeds no human can achieve and can freeze the tab
  on large DOM virtualizers. Use the named speed tiers above.
- **If in doubt, start conservative** — halve/double the current value
  as a first experiment, not 10× changes.














