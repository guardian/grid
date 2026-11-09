# Case Study: A Small Animated Widget and Scroll Layout Cost

November 2026. An explanatory case, not a maintained performance baseline.
No recordings or captured event rows accompany it; the numbers below are reviewed
aggregates. Use the [how-to](README.md) to make fresh measurements.

## Question

Intermittent phone scrolling stutter had resisted simple reproduction. Smooth
frame delivery did not always imply evenly advancing content, and public browser
work did not diagnose the installed device. Rather than require another felt
hitch before making progress, the next question was narrower: what avoidable work
does normal scrolling perform?

The target was Kupua's Android Chrome-installed PWA, not the legacy frontend.
Fixed Grid was profiled first; later source attribution used Justified, where the
operator reported the symptom more frequently. The views share infrastructure,
so they were not treated as independent engines or ranked using unmatched loads.

## Measure Before Naming the Culprit

Short native traces separated JavaScript callbacks, style/layout, paint/commit
and image work. A separate CPU sample identified generated-source owners. Heavy
collection was not combined with network observers or a page animation-frame loop.
The actual loaded production build, foreground, query, viewport and image readiness
were checked, not inferred from a successful build on disk.

An initial result was a small StatusBar memo boundary: visible-range-driven parent
renders rebuilt unchanged ticker tooltips. A failing-first test witnessed that
work and preserved actual ticker/selection/query updates. This removed a real cost,
but its sparse CPU samples did not establish an overall scrolling improvement.
That was a checkpoint, not evidence that useful performance work was exhausted.

## The Expensive Reader Was Not Necessarily the Writer

Source arguments were initially filtered out of native events. Preflighting a
private source-attribution recipe established which fields were available before
another full sample. Missing source information was never treated as zero cost.

The new trace charged repeated synchronous layouts to geometry-reading callbacks,
including a virtualizer callback and `useScrollEffects`. One hypothesis was that
reading geometry before synchronous visible-range publication would avoid a
read-after-write flush. A focused test witnessed the ordering, and behavior tests
passed after batching the reads.

The phone measurement rejected it: the handler still owned 138 Layout operations
at essentially the same cost. The implementation and its experiment-only test were
removed. Passing tests did not make it a performance optimization.

The next nearby writer was the Scrubber. Its small thumb and tooltip used layout
`top` updates, including a thumb transition. These could dirty layout which later
scroll-position readers had to resolve. The callback charged for the resulting
flush was not necessarily the code that created the dirty layout.

## Isolate the Writer, Preserve the Experience

A temporary widget-only probe changed those position writes to transforms while
preserving their target coordinates and transition behavior. Isolated checks
verified physical positions, native CSS-property restoration and cleanup. The
probe was bounded and removed afterward; it was not called production evidence.

It sharply reduced layouts charged to the virtualizer callback. A production
change then used `translateY` for the thumb and position tooltip, anchored at
layout top zero. Position arithmetic, clamping, drag/seek logic, boundary labels,
image admission and visible-range publication were left intact.

### Reviewed Comparison

Each arm used six alternating injected swipes in the same Justified query and
viewport, starting at the top with all visible images ready. Injected input is not
a hardware finger-contact witness.

| Arm | Layout operations | Layouts charged to virtualizer callback | Style/layout wall-time union, ms | Consumed CSS-equivalent px |
| --- | --- | --- | --- | --- |
| Production baseline |625|385|308.275|11490.05|
| Read-batching experiment, rejected |619|378|312.791|11494.93|
| Widget-only transform probe |257|28|291.105|11494.81|
| Production transform candidate |258|26|269.191|11506.08|

The production main-task wall-time union was 2357.229ms versus 2222.701ms in this
comparison. These are unions/phase costs, not summed overlapping subtree costs.
The strong structural result was hundreds fewer layouts for comparable movement,
not a claim of "59% faster scrolling" or a statistical whole-application speedup.

The comparison is bounded: one phone, one workload, tracing overhead, and modest
initial offscreen image-readiness differences. Nonzero discarded-chunk counters
were retained as coverage caveats even without reported overwrites/parser errors.

## Behavior Gates Still Matter

Existing tests that inspected the old inline position property were updated to
read the new target representation, keeping the same numeric position assertions.
A painted-position E2E test then caught a real regression: after content reset,
the target was zero but the compositor transition still painted slightly away
from the origin. Its tolerance was not relaxed.

The final refinement snaps actual zero offsets while preserving ordinary
non-origin motion. That decision belongs to the actual written offset, since a
logical prop can temporarily lag continuous scrolling. See
[Scrubber](../../../src/components/Scrubber.tsx) and its existing tests for the
current implementation; generated-source offsets from an old build are not stable
code references.

The final refinement passed full units and E2E, with retry cases disclosed rather
than described as a clean first-attempt run. It was behavior-tested, not separately
performance-profiled; the production numbers above precede that endpoint refinement.

## Outcome and Transferable Lessons

The operator subsequently reported that stutter was much harder to reproduce and
could no longer be reproduced in normal use. That supported accepting the change
as practical success; it did not establish that every possible future hitch was
fixed or diagnose a browser/device limitation.

- Follow measured cost to both the reader and the preceding writers.
- A tiny animated control can create work far outside its own React subtree.
- Preserve the actual workload and required behavior in counterfactuals.
- Reject an optimization when its performance check fails, even if tests pass.
- Compare the production implementation after removing the diagnostic wrapper.
- Keep field reports, trace-derived observations and causal claims distinct.
- Preserve the method and queries, not credentials, recordings or stale build guards.