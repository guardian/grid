# Experiments and Follow-Up

[Laboratory procedure](README.md) | [Executable recipes](controls.md)

This is the place to pick a question back up and record its disposition, not a
standing execution mandate. No product optimisation is selected by the open leads
below. Confirm the operator's scope, current source and live permissions first.
Detailed evidence already stored elsewhere stays there; do not create a second
numerical history here.

## Resume Here

Current disposition, 18 November 2026:

| Question | Status | Evidence and next step |
| --- | --- | --- |
| [Justified publication hitches](#justified-publication-hitches) | Open cause; mapped-selection candidate rejected | Attribute production publication work before selecting another intervention |
| [Grid backward image arrival](#grid-backward-image-arrival) | Earlier admission demonstrated; useful benefit unqualified | Match delivery/content and test whether the extra lead improves current images |
| [Table scrolling cost](#table-scrolling-cost) | Open attribution; pagination unselected; containment parked | Separate invalidating writes from triggering reads; resolve comparison mismatch before another containment claim |

The latest reviewed [campaign manifest](../results/campaign-log.js),
`before U5_diagz` completed 18 November, contains four repetitions and 312/312
completed observations. It used the local app against deployed TEST with canonical
media, not the hosted production frontend. Use its linked family histories and
[comparison contracts](../measurement-reference.md) for current context, not as a
controlled before/after for the hosted observations below. Recheck the newest
complete compatible checkpoint when resuming; completion is not a performance verdict.

## Record Format

Add a heading for a new question, or append a dated result to its existing entry.
Use these fields proportionately; a brief negative result need not become a report:

- **Status and question:** user-observable symptom, intended improvement and current disposition.
- **Hypothesis and discriminator:** suspected cause, falsifying observation and why existing evidence is insufficient.
- **Reuse and method:** exact recipe/test filter and evidence key; source/build, topology, workload, input, cache/setup matching, treatment order, observation boundaries and authorised budget.
- **Findings and costs:** measured outcomes, populations, adverse results and limits; link detailed numbers rather than copying them. Separate invalid captures from valid candidate failures.
- **Decision and next step:** promising, rejected, inconclusive or invalid; smallest unanswered question, or the condition needed to reopen a closed question. Not implicit implementation approval.
- **Validation and cleanup:** checks actually run, unverified requirements, probe/resource cleanup and private-artifact disposition. Never record credentials or inherit a prior session's live authority.

Keep current status concise, preserve dated evidence and exclusions, and avoid
per-run files. Existing scrolling observations belong in
[the research JSON](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json)
under a named record. The sections below retain the missing useful conclusions from
the November worklog, not its session chronology.

## Justified Publication Hitches

**Status:** open attribution question; stable-key-only and mapped-selection recipes
did not establish a useful fix. Latest controlled results are
`scrollReconPortfolio20261117.justified` in the research JSON; the runnable
[selection recipe](controls.md#justified-forward-eviction-selection) remains available.

**Question:** can avoidable work during a buffer update be removed without changing
placement, progress, image readiness or the single compensation owner?

**17 November hosted reconnaissance:** 1200x999/DPR2, normal media delivery,
programmatic scrolling. These are bounded instrumented observations, not native
wheel/presentation evidence or a matched production optimisation comparison:

- Hiding only images on the same 7000px steady-window path, normal/hidden/hidden/normal,
  showed no repeatable frame benefit. Content endpoints and travel matched, but
  loaded-media/cache state did not. This does not test publication-time image cost.
- At 2356px/s, seven seconds forward, two reverse and one stopped, two update
  episodes coincided with 35.2/39ms frame gaps and 27.2/28.4ms timer lateness.
  Without the DOM observer, two scroll-origin corrections still coincided with
  36/30.6ms gaps and 29.1/25.4ms lateness. Another hitch had no correction.
  Main-thread unavailability is implicated; not every hitch is a publication,
  and React, geometry, style/layout, GC and browser scheduling remain unseparated.
- A connected-DOM follow-up observed 69/71 newly inserted cells removed after
  roughly 15-18ms in two correction intervals. None of those image identities
  remained in the region at the next sampled frame. This suggests temporary cohort
  construction, not proof of painted wrong images or the cost attributable to it.

The local source hypothesis concerns the virtualizer measurement effect in
[ImageGrid](../../src/components/ImageGrid.tsx) and publication compensation in
[useScrollEffects](../../src/hooks/useScrollEffects.ts). Exact deployed-source
equivalence was not established. The subsequent mapped-selection counterfactual
preserved its final viewport but increased short-lived construction and script,
style and layout work in both orders. **Do not ship or keep extending that recipe.**

**Next discriminator:** attribute a current production publication with matched
achieved work and light-observer controls. A future candidate must remove the
specific temporary work and improve the relevant outcome, not merely retain more
nodes. Do not mutate virtualizer internals, add a placement owner or reopen a
general retention framework by assumption.

**Limits and cleanup:** ad-hoc hosted drivers were not retained as supported tools;
raw captures were deleted. One earlier prototype-wrapper run failed descriptor
restoration: its frame timings are excluded, and the page was reloaded with native
methods verified. Later probes were removed and final visible images loaded.
These summaries are retained observations, not independently replayed lab results.

## Grid Backward Image Arrival

**Status:** promising admission mechanism, useful-image benefit unqualified.
Detailed method, numbers and exclusions:
`scrollReconPortfolio20261117.grid` in the research JSON.

**Question:** after fresh backward entry, can earlier upper-row admission improve
current-image readiness without unacceptable extra work or worse forward/reversal behaviour?

**17 November finding:** a browser-only eager hint on the immediate upper row
created about one row of request lead. At the tested 100 results/s, that is about
40ms against observed resource durations of roughly 360-400ms. Readiness remained
poor. Different photos, cache conditions, durations and node replacements make this
an unpaired mechanism observation, not evidence of a speedup or regression.

**Next discriminator:** compare the current two-lower-row policy with one additional
upper eager row under matched content/delivery and fixed metadata policy. Include
ordinary as well as fast backward entry, then forward/reversal and stopped costs
if the candidate earns further work. Confirm useful readiness rather than request
lead alone; do not enlarge buffers or overscan to rescue the premise.
The [owning guide](../../exploration/docs/scroll-horizons-thumbs-and-blocking.md#recommendation)
retains the policy boundary. Browser hints were restored and the page reloaded;
there is no retained upper-row product change or executable comparison from this pass.

## Table Scrolling Cost

**Status:** source attribution remains open. Pagination reset disabling is unselected;
row containment is parked after an invalid moving comparison.

**Question:** is there avoidable layout/paint invalidation during scrolling, beyond
the already-repaired retained-row rendering work?

### Pagination Reset: No Demonstrated Benefit

The [isolated recipe](controls.md#table-pagination-reset-counterfactual) used a fixed
400-image window, warm synthetic media and 2560px travel at 1200x999/DPR2.
17 November observations, in default/disabled/disabled/default order:

| Arm | Resets / pagination updates | Parent renders | Controller-window TaskDuration, ms |
| --- | --- | --- | --- |
| Default | 64 / 64 | 258 | 805 |
| Disabled | 0 / 0 | 308 | 855 |
| Disabled | 0 / 0 | 288 | 826 |
| Default | 71 / 71 | 292 | 816 |

All arms rendered the same 80 distinct rows with 160 counted row renders and
preserved endpoint/focus/data. Removing resets did not reduce rendering or measured
task work. DEV counts and whole-controller durations are not production latency.
Reopen only for a materially different question, not another attempt to obtain a win.

### Layout Attribution: Trigger Located, Writer Unknown

The [motion-bounded recipe](controls.md#table-scroll-layout-attribution) reuses that
fixture for forward and reverse travel. A passing 17 November observation:

| Direction | Motion / marked boundary, ms | Layout + style union, ms | Paint-related union, ms | Layout events | Layout enclosed by handleScroll, ms |
| --- | --- | --- | --- | --- | --- |
| Forward | 813 / 859 | 63.1 | 110.9 | 195 | 22.7 of 30.5 |
| Reverse | 802 / 814 | 63.2 | 108.7 | 122 | 23.9 of 32.8 |

Served-source lookup places most synchronous Layout inside `useScrollEffects.handleScroll`,
with React callbacks enclosing most of the remainder. That locates triggering reads,
not the invalidating writer. `partialLayout: false` and up to 218 dirty objects out
of 4351 do not mean every object was recomputed. Paint-related totals include
PrePaint/layer work. These are interval unions, not additive CPU attribution.
Forward/reverse endpoints mount 59/44 rows; they are not equal-work treatment arms.

**Containment follow-up:** `scrollReconPortfolio20261117.table` records a hosted
normal/contained/contained/normal pass. Moving content/geometry signatures differed,
including the final normal arm: the comparison is invalid. A stationary check
matched, but does not qualify scrolling or explain the mismatch. No benefit claimed.

**Next discriminator:** find the preceding invalidating writes under matched motion
before changing geometry reads. Resolve moving-signature differences before resuming
containment; keep columns, text, interactions and placement intact. The
[phone case study](mobile-perf-measurement/case-study.md) already rejected one
read-batching approach and illustrates why the expensive reader may not be the writer.

## Verification Checkpoint

Recorded 17 November: performance typecheck and the layout, pagination, retained-row
and traced-return controls passed (four cases, 29.1s). The final mapped-selection
case passed (27.2s total), followed by all eight existing publication/retention controls
affected by its shared helper (29.3s). Earlier collector and reverse-direction failures
were resolved; invalid observations were excluded, not pooled with passing captures.
Structured CDP batches replaced a raw-stream collector that exceeded size bounds;
the cause of that excessive raw size was not established. An unsigned reverse arm
failed its exact endpoint check and was excluded before correcting the direction.

On 18 November, commit review reran the performance typecheck and 40 offline dashboard
tests successfully, but did not rerun browser experiments. No production source changed;
these results do not replace product gates or qualify a production optimisation.
Isolated contexts/servers and hosted probes were cleaned up. No active capture or
live authority carries forward from these records.