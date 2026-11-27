# Experiments and Follow-Up

[Laboratory procedure](README.md) | [Executable recipes](controls.md)

This is the place to pick a question back up and record its disposition, not a
standing execution mandate. No product optimisation is selected by the open leads
below. Confirm the operator's scope, current source and live permissions first.
Detailed evidence already stored elsewhere stays there; do not create a second
numerical history here.

## Resume Here

Current disposition, 22 November 2026:

| Question | Status | Evidence and next step |
| --- | --- | --- |
| [Justified publication hitches](#justified-publication-hitches) | Open cause; mapped-selection candidate rejected | Attribute production publication work before selecting another intervention |
| [Grid backward image arrival](#grid-backward-image-arrival) | Earlier admission demonstrated; useful benefit unqualified | Match delivery/content and test whether the extra lead improves current images |
| [Table scrolling cost](#table-scrolling-cost) | Open attribution; pagination unselected; containment parked | Separate invalidating writes from triggering reads; resolve comparison mismatch before another containment claim |
| [Indexed Grid backward supply](#indexed-grid-backward-supply) | Earlier reads reduced undercoverage on a matched local release path; brief movement can fetch an unneeded page | Review the speculative-read cost before changing indexed admission; separate from thumbnail delivery |
| [Indexed Justified browsing](#indexed-justified-browsing) | Sustained local passes did not reproduce the larger-tier hitch; zero-delay track clicks increased demand on retarget | Keep click coalescing; do not transfer development-only publication costs to the release client |

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

**22 November, local hosted follow-up:** `localHostedResident20261122` in the
[research record](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json)
matched Table row identities, text and geometry at five positions on a fixed
resident path. The lean reverse-order control found no repeatable frame benefit
from row layout containment. Leave it unselected. The same record distinguishes
Justified first-exposure hitches from smooth revisits on a 334-result set; it
did not exercise eviction. A local cohort above 1,000 but below 65,000 tests
indexed browsing, not the larger seek tier.

## Indexed Justified Browsing

**22 November, 1,032 local results:** see `localHostedIndexed20261122` in the
[research record](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json).
Two forward passes crossed growing geometry and matched endpoint images without
reproducing the short-lived cohort or a large frame gap. Direct off-window scroll
writes and explicit scrubber clicks have distinct owners; do not infer user seek
latency from the maintenance timer. A scoped click-only zero-delay experiment
advanced list request starts by about 200ms, but readiness still varied and quick
retargeting issued two reads instead of one. **Keep coalescing.** This does not
resolve the larger-tier publication question or justify changing drag behavior.

After ingestion settled, four more nonresident landings per build at 1,634
matches separated local list response, buffer publication (Vite), real cells
and loaded images. The requested image was confirmed in view in Vite, where
each publication coincided with a script-heavy long frame. The compiled hosted
client did not reproduce that long-frame pattern. The record distinguishes the
two endpoint witnesses; these are not build-speed ratios.

## Indexed Grid: Backward Supply

**22 November: promising mechanism, not selected.** On the local 1,634-result
index, backward travel at 100 results/s sometimes outran *metadata*, even when
the real thumbnails that entered view were already loaded. Calling the existing
backward read about 40 results earlier eliminated measured logical undercoverage
in both sustained release-client arms; both fetched exactly the same two pages
and reached the same image as normal. But a short movement that stopped well
inside the current page fetched a speculative 200 records in both Vite candidate
arms and neither normal arm. A matched hosted short-stop series was not obtained.

See `localIndexedGridBackward20261122` in the [research record](../../exploration/docs/scroll-horizons-thumb-lookahead-results.json)
and the [control](controls.md#indexed-grid-backward-runway). **Decision for later:**
is that extra page worth avoiding a partial row gap during sustained fast backward
travel? This is not a reason to increase thumbnail eagerness, change Justified,
or generalize the existing seek-tier predictor to every indexed scroll event.

## Verification Checkpoint

### Local Image Operations, 22 November

Local indexed media-api, real local imgproxy, 1,634 matches, existing compiled
hosted and laptop Vite tabs. These are bounded interactive diagnostics, not
canonical P13/P14 campaigns. Browser frame callbacks do not certify paint.

| Operation | Observation | Interpretation |
| --- | --- | --- |
| Desktop resident Detail | Corrected observer paired intended `StableImg` source with its matching Detail-owner branch. Four forward owner/decode pairs (ms): 9/45, 8/26, 8/29, 8/37; reverse: 7/10, 8/10, 11/14, 10/13. | Full local proxy sources, no thumbnail credited; reused tab, not cold. Earlier alternating decode misses read a stale React branch and are excluded. Before imgproxy was enabled, one 171x256 thumb-only entry was not a successful full-image landing. |
| Rapid traversal and return | Six forward, three reverse at about 85ms between inputs. All nine expected owners appeared in 10-13ms; two outbound images not ready at the cadence check. Zero observed singleton fetches. Final owner decoded, history grew by one, and Back reached the list with the last image visible in 15ms. Another clean return took 30ms. | Do not wait for intermediate decodes in the input driver. Initial stacked-history return attempt and an observer accepting a list underneath Detail were excluded. |
| Results zoom | Fixed Grid changed 297px tiles to 449px then 907px and back; source stayed visible, not at a guaranteed constant pixel when constrained. Justified, selected image, normal/reduced/reduced/normal, four steps per cycle: widths 265/374/636/374/265 and top 304px throughout. Normal morph actually ran, reduced never constructed it. Max gaps per step: 299/15/201/32, 26/16/16/38, 31/15/16/30, 36/18/15/40ms. | First normal exposure hitched; final normal did not. No repeatable case to disable morph. An unfocused exploratory second step had a 562ms gap but tracked a centre sample, not the elected anchor. |
| Fullscreen and compact zoom | Desktop wheel set 1.36x synchronously; Fit reset in about 1ms. The 400 checked Vite originals were at most 1,280px; native caps made base and zoom URLs identical at desktop screen size. Under 412x860 DPR2 coarse emulation, a distinct 824x548 base upgraded to 1280x852 at 2.17x. Fit retained the sharper resource. | Viewport dimensions alone are insufficient: desktop emulation initially left `screen.width` at 1,800. On repeated compact zoom the already-complete high source stayed unchanged, no high resource completion, dispatch 0-2ms and next callback 1-7ms. Extra observer `decode()` calls took up to 1,380ms and are not visual latency. |
| Compact traversal and late zoom | Compiled client, scripted touch, short drag snapped back in 208ms with unchanged owner. Two forward and one reverse animation completions were 203/201/208ms; correct loaded proxy owners at 220/212/224ms from release. Vite returned the expected base on a separate swipe at 473ms. After holding an exact off-DOM high rendition's already-decoded promise across Fit and navigation, releasing it caused no stale source assignment on the new owner. | The carousel intentionally animates for 200ms. Synthetic contact, not physical touch. Earlier reverse probe used the wrong slot name and was excluded; matched reverse used `previous`. |
| Selection, panel, sort | Resident Shift-range matched 37 expected images in 40ms with no observed fetch. Details hide/show/hide/show retained 37 at widths 1247/923/1247/923px (90/80/38/46ms to changed control plus a frame). Sorting in both directions after focusing an image changed toolbar indication in 14/10ms; same image visible after a qualifying page response at 1156/836ms. Initial page response ends 1107/813ms. | Not a 1,000-image reconciliation benchmark or proof of complete sort settlement. Disabled Crop on four sampled owners was respected, not timed as a successful entry. |

**Compact list pinch and metadata drawer.** With a different image selected,
scripted two-contact Grid and Justified gestures each committed one zoom step.
The point 35% down the touched thumbnail moved 0px in Grid and 0.1px in
Justified; cancellation preserved both the offset and point in each layout.
Selection survived all four gestures and no preview overlay remained. No DOM
morph was witnessed during these compact runs. The current image's metadata
drawer expanded/collapsed twice: its control changed in 8-11ms, and its
position satisfied the delayed four-frame stability check at 266-287ms.
The image owner stayed unchanged. These are browser callbacks, not paint times.

**Compact Back follow-up:** an immediate check had seen Search before fullscreen
exit. On a fresh compact Detail entry, Back returned to Search at 33ms,
`fullscreenchange` confirmed exit at 37ms, and Search remained active. The
earlier sample did not establish a stuck-fullscreen defect.

**Crop on a valid local image.** For one authorized throwaway image with a
description, the ordinary single-image Rights editor saved publisher photography
with a synthetic creator. Derived Credit populated; the API reported valid,
no invalid reasons, and a crops relation. Eligibility survived reload. The
compiled client independently found the image as its sole free-only result.
First hosted entry reached the dialog at 340ms and the loaded image plus nonempty
numeric frame at 401ms. Square selected an 853x853 frame at (213,0) on a
1280x853 source. Preset alone left without warning, as specified. After a manual
960px width edit and a preset change, cancelling Back prompted once and kept
the draft; accepting Back returned to the same image. No crop was submitted.

Compact Vite entry with a fresh read reached loaded cropper media and selection
at 395ms. With the precision panel open, two Zoom/Fit cycles kept all four
source coordinates unchanged. Displayed image bounds changed from 388x259 to
1164x776 and back both times. The upgrade from 824 to 1280 native pixels changed
the Fit transform scale, not the fitted geometry. Two-frame checks for Fit were
448 and 17ms: an outlier, not a repeatable visual-latency finding. An earlier
closed-panel comparison with zero coordinate inputs is excluded.

**Browse and filter.** Hosted Browse changed its control at 14/11ms on opening
and reopening. One aggregation completed at 155ms in the first 1.25s window;
none completed in the second. Free-only reduced the displayed count from
1634 to 1 in 191ms and clearing restored 1634 in 858ms. In a separate quick
reversal, the first page/count had already started; returning to the original
scope at 8ms issued its own page/count and ended at 1634 with visible results.
This does not establish search cancellation for every CQL input path.

**Traversal across a buffer boundary.** Vite compact Detail, local indexed
Search, 80 forward clicks from global index 125 to 205 at a minimum 85ms
cadence. Each landing advanced exactly one index (81 distinct owners including
the start); owner time median 33ms, max 169ms. The proactive extension started
at index 180, one local page response ended at 6358ms from the first click and
the 400-image buffer published at 6502ms. No observed singleton read. The last
owner displayed a loaded proxy rendition. These Vite timings are not a matched
comparison with the shorter hosted burst.

A separate hold tested continuity rather than speed: hold one already-returned
local page before publication, reach 399, press Next twice, then Previous.
The image stayed at the missing boundary until Previous moved to 398. Releasing
the page extended the buffer; the image stayed at 398 through the subsequent
500ms observation. Only one matching read issued. The hold and fetch override
were removed. No traversal or access policy change follows from these results.

**Off-buffer range and Details.** On hosted indexed Table, a normal Shift-click
from displayed row index 3 to 1071 selected exactly 1,069 images and marked
the endpoint. Input dispatch took 4ms; count reached 1,069 at 164ms with
Details closed. Two key reads completed by 150ms; four mget completions fell
inside the observation window at 596-598ms. Count readiness is not hydrated
metadata readiness; the observation window is not a complete fetch budget.
Opening Details afterward required no observed new fetch in two short windows,
but had frame gaps of 1043 and 287ms. Subsequent open controls (large, large,
empty, empty) held the first mounted row and destination width fixed. The panel
toggle changed at 31/19/6/9ms; max callback gaps were 175/144/108/58ms.
The large selection stayed intact until explicitly cleared. Gaps also occurred
with an empty panel; the one-second gap did not repeat. Order and cache state
are not counterbalanced. No exclusive render attribution, new bug or reopening
of the resolved default-collapsed chip issue follows from these observations.

**Large-selection attribution and sparse fields.** Re-established the same
1,069-image hosted Table range. On three openings, 11 full-length ID sorts
and 12-13 full-length JSON encodes took 2.4-3.2ms combined per opening. The
arrays were not all identical. This excludes set construction and GC; it
does not justify a global selection-key cache. With the same first row and
selection, temporarily holding Table at the destination 923px width instead
of resizing from 1247px did not remove the gaps: normal maxima 157/42/109ms,
held 115/202/91ms. Inline constraints removed; ordinary widths restored.
Four subsequent warm panel toggles retained all 59 Table images, with no
observed src changes or completed image/fetch requests (maxima 11/26/10/19ms).
Three cached range reselections reached the same 1,069 count in 144/97/98ms;
each issued two observed key reads, no mget completion in the 400ms follow-up.

An independent pure-cost control used the actual incremental reconciler. On
the 201 local resident records all five chip fields were empty. A deliberately
higher-cardinality synthetic case started with 400 distinct chips and folded
600 further images with none for that field. Keeping the unchanged chip array
instead of rebuilding its map and entries gave identical serialized results:
total 1,000, 400 distinct counts of one, original total still 400. In old/new/
new/old/new/old order, time in ms was 282.4/0.3/0.1/11.2/0.1/11.0 in Vite.
Treat the very large first old sample as an outlier; these numbers measure one
field, not panel-open latency. The implementation selects only this empty-add
fast path. Wholesale replacement of cached incremental updates by full
reconciliation remains unselected: relative cost depends on the existing
selection versus the addition and on freshness/pending state. See also
[KUP-055](../../exploration/docs/bug-backlog.md#kup-055) for the separate
mixed-scalar correctness repair; no change to acquisition or cache capacity.

### Earlier Validation

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