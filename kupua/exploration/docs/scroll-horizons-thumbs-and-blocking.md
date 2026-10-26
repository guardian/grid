# Scroll continuity: decisions and next work

Updated 25 October 2026. This guide owns the shipped scope and follow-ups for **B2:
metadata supply and buffer-edge blocking**, and remaining **F2: current-image delivery**
work. It retains current policy, useful evidence and limits, not session history.
Numeric records live in the [research evidence](scroll-horizons-thumb-lookahead-results.json)
and [campaign history](../../e2e-perf/results/density-log.json). Historical
recommendations inside those records are checkpoints, not current authority.

## Recommendation

**Next work: evaluate one eager thumbnail row above the viewport in Grid and
Justified, retaining the two eager rows below.** Compare against the current
two-below-only policy with metadata admission held fixed. Measure unseen upward
entry after seek/eviction, forward motion, reversal, stopped recovery and refresh
costs. Assess each layout independently; no retention, key, scheduler or buffer
change is included. This selects the next comparison, not an unmeasured rollout.

**Implemented scope: the bounded 400ms backward predictor for fixed Grid/Table;
Justified retains threshold 50.** The operator selected this scope on 25 October.
Justified expansion requires separate acceptance or correction of its late
current-image cost. Local controls and matched
canonical comparisons support the continuity benefit and bound the extra work.
One speculative page is an accepted compromise, not a failure merely because it
is unfinished when current photos first decode. Justified has a measured later
readiness cost that an early ready clock misses. Do not widen horizons, add a
scheduler or rerun a broad campaign merely to demonstrate walls again.

This scope selection reflects measured per-layout costs, not a claim that
Grid/Table always retain their existing image elements through publication.

The local HTTP value study below does not justify a production retention framework
or make retention a new B2 prerequisite. It reproduces blocking before reduction,
but element survival alone does not establish useful photo-delivery benefit. Its
small loopback SVG controls do not refute the earlier canonical-media witness.

### Implementation Boundary

`useDataWindow` takes an explicit layout policy. Fixed Grid and Table opt in;
the shared ImageGrid path passes Justified explicitly, and omitted policy (Detail)
retains threshold 50. The stable reporting callback reads current policy and breaks
velocity continuity across policy changes. Only buffer-local backward admission
uses `forwardExtendThreshold(-velocityEma)`; indexed and forward policy are unchanged.

Viewport validity, velocity resets, legitimate non-wheel demand, seek/maintenance
ownership, cooldowns and per-direction concurrency remain authoritative. Page size,
buffer capacity, compensation, keys, retention and thumbnail eager bands are unchanged.
Upper-row work is neither included nor a prerequisite for adoption.

Product regressions cover early admission, the base and cap, layout changes and
discontinuities, real-store cooldown/concurrency/seek cancellation, and stopped
anchor preservation through delayed publication. Research adapters explicitly retain
historical threshold-50 counterfactuals; product short-stop controls run unmodified
admission. The numerical studies below remain pre-adoption evidence, not fresh
measurements of the shipped policy. Compatible performance campaigns remain operator-run.

A bounded post-adoption local-app check used deployed TEST and canonical media:
18 metadata requests, no direct-ES traffic or metadata failures, with observation
through Grid publication and short reversal. Table/Justified browsing did not reach
a further refill boundary. Sampled stopped anchors stayed stable; temporary visible
image loading remained. A result-summary overlap blocked pointer activation of the
Table button in that viewport; keyboard activation worked. That uninvestigated toolbar
observation is outside B2. This functional check is not a paint or performance certificate.

The current qualification and limits are `b2QualificationClosure20261025` in the
research evidence. Older partial checkpoints and their pending recommendations
are historical; the Table measurement blocker is resolved.

Live evidence shows metadata publication releasing walls while thumbnails remain
pending. Cleanup can reduce delivery contention; it cannot supply missing records
or guarantee stable Justified packing. Initial runway and late-arrival geometry
are separate decisions.

Keep three independent goals:

- **Useful progress:** ready current images while browsing and after stopping.
- **Smoothness:** consistent frames, not smooth blank slots or a stalled viewport.
- **Stability:** intended identity/position and correct ratios without unsolicited movement.

No aggregate score or request-count reduction can trade away one of these goals.

<a id="current-decision"></a>
## Current State

| Area | Implemented baseline | Remaining decision |
| --- | --- | --- |
| B1 and velocity ownership | Stale viewport reports do not become backward demand; maintenance does not create predictive velocity. Legitimate programmatic demand remains valid. | Candidate-specific navigation/maintenance interaction, not a wheel-only admission rule. |
| F1 thumbnail admission | Thumbnail-only loading updates; visible rows plus two lower rows eager, upper/rest lazy, five-row overscan. | Sustained delivery and unseen backward entry; the lower band is not a complete priority policy. |
| B2 | Fixed Grid/Table seek-mode backward admission mirrors the existing 400ms predictor, base 50 and cap 200. Justified/default and indexed backward admission retain 50. | One speculative page is accepted. Late-publication costs, initial runway and Justified expansion remain separate decisions; no upper eager row or retention policy follows. |
| Fixed Grid | KUP-042 preserves global row membership and net-origin compensation, with complete pages and exact-capacity eviction. | Media arrival/animation is distinct from fixed-row correctness. |
| Grid/Table rendering | Reused locale formatters, memoized date/cell content and stable image-based inputs avoid demonstrated repeated work. | New optimization needs a measured residual bottleneck; no broad renderer rewrite is justified. |
| Table identity and lifetime | Photo-ID row keys retain elements while rows remain mounted; detached incomplete thumbnails release their native source. | Publication can omit retained rows; a bounded retention counterfactual works, but sparse selection invalidates the current cache's contiguity assumption. |
| Grid/Justified lifetime | Detached incomplete thumbnails release their source; connected/completed/shared consumers remain protected. | Conditional benefit, not visible-first scheduling or proof of upstream savings. |
| Detail return | Grid handlers read current query params without depending on image-only route identity. | No clear warmed-return latency gain or wrapper/restoration redesign justified. |
| Justified geometry | Truthful dimensions and anchor compensation remain authoritative. | Partially known boundary blocks can repack visible images despite a stable centre anchor. |

<a id="b2-the-next-decision"></a>
## B2: Implemented Policy and Evidence

### Selected Policy

Fixed Grid/Table reuse `forwardExtendThreshold(-velocityEma)` for **seek-mode backward admission**:
`min(200, 50 + max(0, -velocityEma) * 400ms)`, with velocity in results/ms. Preserve
first-row validity, velocity resets, base demand, cooldowns, per-direction
concurrency and compensation. Leave forward policy, indexed mode, page size and
retention unchanged.

This implements the 400ms candidate in `b2LocalComparison20261020` for the selected
layouts, not the later 1,000ms experiment. The historical qualification below does
not authorize broader layout or retention changes.

### Established Evidence

The corrected matched study has ten pairs per layout, both treatment orders,
matched starting windows/geometry, synthetic media and held metadata reads.

| Case | Result | Decision value |
| --- | --- | --- |
| Grid, 900ms reads, sustained/reversal/capacity | About 259-340ms blocking became zero; one extra page and greater travel. Some frame/exposure results worsened. | Strong support for the smaller predictor; fewer walls alone is not acceptance. |
| Justified, same slow-read cases | Blocking fell by 623-658ms but remained 337-381ms; one extra page and more travel. | Meaningful reduction, not uninterrupted browsing. |
| Fast 350ms delivery | Neither policy blocked. | Retain as a negative control; do not invent benefit where supply keeps up. |
| Exact 600px short stop | Zero versus one read, without a candidate post-stop refill chain. Justified exposure was 46-49% versus zero; stopped readiness about 199-205ms versus 40-52ms. | One extra page is the accepted bounded speculation envelope, but visible cost still needs qualification. |
| Capacity/reversal | Retention stayed bounded; held-refill/current-policy anchor controls exist. | Reuse them without claiming coverage of every candidate navigation or all-visible-box transition. |

Grid and corrected Justified records use different setup revisions. The rejected
Justified setup allowed prefetch during restoration, changing 201 records to 401
before timing. Accepted pairs activate the candidate after matched setup. Do not
pool the rejected setup or prohibit legitimate programmatic demand to avoid it.

### Current-Baseline and Canonical Qualification

`b2CurrentBaseline20261025` retains the complete accepted rows and exclusions.
All 20 original local pairs passed unchanged on the repaired baseline: both orders,
short stops, slow/fast reads, reversal and exact-capacity retention. Cleanup remains
on in both arms. Grid slow-read walls of 226-245ms became zero. Justified walls of
978-1005ms fell to 331-383ms, but short-stop decode remained 152-164ms versus
35-50ms. Its moving short-stop exposure is much lower than the old study; do not
carry forward the old 46-49% as today's result. Extra reads and worse worst-frame
intervals remain visible even where frame-p95 is similar.

The foreground live app verified deployed TEST/media-api and **canonical** media,
with current callback/cleanup repairs. Eight bounded 3s passes used the existing
journey/readiness probes, natural delivery, HTTP-cache bypass during measurement,
and exact same-record/offset/visible-box/scrollTop setup within each pair. Only the
browser-served backward expression changed in memory. Viewport 1150x919/DPR2 is
not the campaign's 1720x960/DPR2; achieved demand and runway are reported separately.

| Canonical pair | Metadata walls, current -> candidate | Costs and limit |
| --- | --- | --- |
| Grid, current-first / candidate-first | 424 / 403ms -> zero; achieved 170 -> 196-199 results/s | Two -> three metadata reads; image starts 548 -> 652/672, cancellations 450/469 -> 575/621. One worst frame rises 67 -> 92ms. Stopped decode improves in one order and worsens in the other. |
| Justified, high-demand current-first | 616 -> 14ms; achieved 178 -> 212 results/s | Phase frame-p95 rises 17.5 -> 41.3ms; image starts 616 -> 758. One pair, not reversed-order high-demand confirmation. |
| Justified, reversed-order lower-demand control | Zero under both; achieved about 104 results/s despite requested 200 | Same 316 results traversed; one -> two reads, 327 -> 379 image starts, stopped decode 421 -> 941ms. Different endpoint images/counts preclude a same-screen latency claim. |

All eight accepted stop cohorts decoded without failures, pending metadata or
post-stop refill chains. Moving pending slots nevertheless approach 100% under
both policies. Counts are global browser demand through different recovery endpoints,
not bytes, current-image attribution or upstream savings. CDN/decoded caches are
uncontrolled; protocol timing is mostly unavailable, so canonical is not proof of
HTTP2. Geometry samples include arrival animation and compensation, not an all-visible
packing/paint certificate. Do not label current Grid's image resize samples a new
KUP-042 defect without attribution.

### Visible Priority and Settled Far Seeks

B2 brings metadata forward; it adds no upper eager thumbnail row. Grid/Justified
mark visible rows plus two lower rows eager, with upper/rest overscan lazy. Those
visible and lower eager images have no separate client priority tiers. Table uses
native lazy loading for every thumbnail. Native lazy admission is a browser heuristic,
not a strict visible-first queue; setting `src` can create offscreen demand.

A seek owns its destination read and breaks velocity continuity with the previous
window. Isolated current/candidate settled-far-seek controls pass for all three
layouts: identical destination records/placement, decoded current images and zero
extra extensions. This rules out a direct metadata-prefetch change in those controls,
not indirect contention from previously started native images on a live network.
Stationary position is not necessarily an empty media queue.

### Current Image Lifetime Through Publication

`publicationIdentityCurrent20261025` tests current source, not the B2 candidate:
one held backward page in seek/buffer-local mode, 300 -> 500 records, no eviction.
Fixture-only witnesses inspect actual committed DOM before existing compensation,
correlated with that render's chosen virtual rows. Keys, admission and scroll writes
are unchanged. The observed initial/final shared cohorts are:

| Density | Shared visible photos | Present in first publication commit | Original image elements retained at recovery |
| --- | --- | --- | --- |
| Table | 27 | 0 | 0 |
| Fixed Grid | 18 | 0 | 0 |
| Justified | 41 | 0 | 0 |

Their new rows lie outside the first committed chosen range. After compensation,
all photographs return with new image elements and correct loaded sources. Even
Table's stable photo-ID row keys cannot preserve a photograph omitted from rendering.
Grid/Justified also have an intermediate snapshot with corrected DOM scrollTop but
the old virtual-row set. Mutation records confirm original removal; no original-img
`src` mutations were observed in these cases. Positive controls distinguish absence,
reinsertion of the same element and clone replacement.

This corrects the earlier Justified-only identity explanation. Slot/spatial correctness
does not establish image-element continuity. The test does not prove a painted blank
or wrong frame, equal user-visible costs across densities, the exact cause of the
canonical late-readiness duration, or behavior under forward eviction/indexed regimes.
Its passing guards validate observation, not a fix.

The first demonstrated issue is coordinating the retained rendered cohort with the
publication/compensation transition. Stable row/cell identity may still matter once
that cohort remains rendered. Compare supported coordination or bounded transitional
retention before proposing direct render-time mutation of virtualizer internals.
Any fix is a separate operator decision; this is not a new universal UX prerequisite
or a reason to discard the measured B2 benefits.

### Table Retention Counterfactual

`publicationRetentionTableC20261025` isolates the proposed supported `rangeExtractor`
union, without changing keys, compensation, metadata admission or image loading.
The failing-first survival assertion reproduced the baseline omission. Adding the
exact new rows for the original cohort kept **all 27 original image elements** in
every captured publication commit, with correct loaded sources and no original
removal or source mutation. The ordinary 58 selected rows temporarily became 85;
the ordinary visible range itself was unchanged. Retention released once after
default selection caught up. A subsequent in-buffer scroll added no rows, revived
no old cohort and caused no further read: one read and publication in total.

Two separate controls expose production-design limits rather than hide them:

- At unchanged count/range, changing a plan behind a stable extractor callback
  leaves the old selection cached; changing the callback refreshes it. The fixture
  deliberately refreshes on every render, not a qualified production cost policy.
- Two sparse selections with matching endpoints/count but different middle rows
  collide in Table's existing contiguous-window sentinel. The second selection
  has images for only two of four required rows. The primary arm avoids that
  collision; it does not make the cache safe for general sparse rendering.

The isolated controls and original three-density diagnostics pass together, with
compiler verification. This proves bounded Table element preservation in one
held-page case, not better fast-scroll timing, native readiness or paint. The
original goal remains **less blocking with useful current photos**. Retention is
supporting research, not a newly imposed prerequisite for already-qualified B2.
No product retention policy, key rollout, dependency upgrade or B2 change is made.

The original interlocutor should challenge cache-safe membership, explicit plan
refresh/release and bounded cost before production selection. Any selected
combination must be compared against B2 alone for blocking, readiness, frames
and demand; zero-remount perfection must not worsen fast browsing or displace
its purpose. Grid and Justified mechanism results follow below.

### Grid and Justified Retention and Keys

`publicationRetentionGridJustified20261025` tests each density independently in
the same held backward-page fixture. C adds exact mapped cohort rows with existing
keys; CK separately adds stable fixture keys, established from setup onward.

| Density | Original photos | Original elements retained with C | Original elements retained with CK | Maximum extra rows |
| --- | --- | --- | --- | --- |
| Grid | 18 | 0 | 18 | 3 |
| Justified | 41 | 0 | 41 | 6 |

C keeps all cohort photos present at every captured commit, but their originals
are replaced. The first-publication-created images then survive the intermediate
corrected-scrollTop/old-range commit and recovery, with no observed removal. CK
also preserves every original image, with unchanged loaded sources and verified
parent keys. Grid retains physical-column cell keys and uses a global physical-row
parent key. Justified uses scoped packed-row-start ordinals **before clipping**
and image-ID cell keys; those ordinals are overlap-relative, not global rank.
The extra ordinal is exposed only by browser-served fixture interception.

The CK survival assertions failed against C before key intervention. All eight
baseline/Table/Grid/Justified cases then pass together, with compiler verification.
Every C/CK arm releases once after default coverage catches up, without stale
retention or an extra metadata read on subsequent in-buffer scrolling. Ordinary
range and the existing compensation owner remain unchanged. No product code,
dependency, B2 policy or virtualizer measurement-key change is made.

This establishes two distinct mechanisms, not a browsing benefit. The uniform
metadata ratios and loaded synthetic media do not expose a meaningful native
readiness penalty. The local HTTP comparisons below assess value independently
for Grid and Justified. Production scope and regression coverage remain separate
decisions; no universal zero-remount gate or general retention framework follows
from these bounded results.

### Local HTTP Retention Value

`retentionValueLocalHttp20261025` records the subsequent value study. First, the
existing delayed-metadata controls reproduced current-policy blocking in both
orders: Grid 232-235ms became zero with B2; Justified 984-986ms became 343-345ms.
Each improvement cost one extra read. Those legacy controls drive 4000px/s, not
the later normalized 200-results/s workload, so their zero-wall result is not
transferred to stronger demand.

The final study has **16 complete comparisons / 52 policy observations**, with
matched starting metadata, placement, visible geometry and loaded initial media.
Each density independently compares current policy, B2, and B2 plus exact-row
retention/stable parent-cell keys (CK), in both treatment orders. Pressure-only
cases also test a stable inner thumbnail key (CK-inner). Real loopback HTTP serves
SVG images: new media is immediate, delayed 1200ms for short stops, or delayed
120ms during pressure. Metadata takes 900ms. No canonical/live services are used.

| Question | Observation | Interpretation |
| --- | --- | --- |
| Does B2 reduce walls at 200 results/s? | Every pressure comparison observes current walls first. About 1.25-1.27s becomes 0.50-0.66s, with two reads becoming three. | B2 improves supply; initial runway still cannot cover the metadata delay. Retention does not remove that limit. |
| Do loaded short stops lose loaded media? | Loaded pending is zero under every policy. B2's node-bound decode acknowledgement resets; CK avoids it. | Acknowledgement reset is not demonstrated loaded-photo absence, a new transfer or blank paint. |
| Does retaining pending Grid photos improve completion? | B2 2291/2299ms versus CK 2280/2280ms; 12 native cohort starts and no repeated starts under both. | A small 11-19ms difference, without transfer saving, does not establish a material benefit or universal no-benefit. |
| Does retaining pending Justified photos improve completion? | B2 4680/4682ms versus CK 4681/4688ms; 21 native cohort starts and no repeated starts under both. | No consistent completion benefit in this controlled HTTP scheduling case. |
| Is CK enough during pressure? | Originals can be replaced under stable cells/parents when arrival-animation state changes. | The inner `GridThumbnail` key is another identity boundary, not a range failure. |
| Does CK-inner solve lifetime? | Grid preserves all three cohorts in both orders. Justified's final third cohorts retain 27/30 and 34/37, with corresponding cell/parent changes. | The inner-key cause is isolated, but broader parent/cell lifetime is not solved or attributed to legitimate rebreak. |

Pressure changes in walls, achieved progress, frames and demand are mixed. Extra
requests cannot be attributed solely to retention where achieved exposure differs.
Several stopped cohorts change; their readiness latency is withheld, not borrowed
from a raw first-ready timestamp. Loaded versus decode-acknowledged pending remain
separate. Cell-area exposure is not a compositor-pixel or missing-data guarantee.

The observer continues through late publication: six seconds after pending-media
short stops, three seconds otherwise. Value identity witnesses use weak references
to avoid explicitly retaining removed native resources. The final whole matrix was
rerun after this repair; earlier strong-reference development timings are not pooled.
Small fixed 200ms publication frame windows, DEV rendering, observer/decode overhead,
HTTP/1 connection scheduling, uniform ratios and two orders limit interpretation.
No population-tail, production-build, bandwidth, codec, cache-neutrality or paint
certificate follows. The earlier canonical late-readiness observation is not refuted.

Final value captures pass all validity gates, with failed preservation hypotheses
reported as outcomes. Earlier transport and stop-gap invalid attempts are excluded
explicitly; the 25ms stop-observer limit is unchanged. The original eight mechanism
controls and compiler checks pass. No product, B2, loading, CSS animation, dependency,
shared app or canonical campaign history is changed.

**Decision:** these results do not earn production retention complexity or a new
gate for the already-qualified Grid/Table B2 decision. Preserve the measured B2
benefit and accepted speculation compromise. Grid and Justified remain independently
eligible for a specifically justified future real-media question, but do not keep
adding lifetime machinery merely to drive remount counts to zero. This study did
not itself select product scope; the subsequent Grid/Table adoption is described
above. Justified's current threshold remains 50.

### Shared-Consumer Qualification and Late Publication

`b2QualificationClosure20261025` supersedes the partial Table checkpoint. All eleven
isolated Table/far-seek controls pass, with compiler verification. The apparent
stopped Table movement was the intended row arrival animation: raw movement about
4.126px matched CSS translation, while layout movement was about 0.00014px. An
independent 8px layout injection was detected exactly. The 1px layout limit remains;
no animation or product placement was changed. Readiness, motion and paint remain
different boundaries.

| Latest comparison | Benefit | Cost and limit |
| --- | --- | --- |
| Table synthetic 350ms reads, 200 results/s, both orders | About 276ms walls -> zero, 176 -> 193 results/s | Two -> three reads; maximum phase-p95 rises to 55-58ms while worst frame falls 146 -> 91-93ms. Extra work drains without an idle chain or stopped layout movement. |
| Table synthetic slow full-capacity reversal | 672-686ms walls -> 376-482ms, two reads each | Walls remain; first-ready timing is mixed. The 100-results/s/350ms negative control has zero walls and one read under both policies. |
| Table canonical, both orders | 368-436ms walls -> zero, 169-172 -> 180-191 results/s | One extra read, more image starts/cancellations, slightly slower decode at different endpoints. Frame outcomes mixed; stopped anchors remain stable, with no idle chain. |
| Justified canonical high-demand reversed order | 667 -> 85ms walls, 162 -> 209 results/s | Initial runway still blocks; one extra read and more request churn. Setup explicitly matches 500 records without adding backward runway. This is not the earlier low-achieved-demand control. |

Native-photo short stops in both orders initially looked benign: exact 600px,
one extra read, current decode about 24-31ms, stable cohorts and less than 1px
sampled displacement. But the extra page arrived **after** that early decode and
the companion journey counted 27 thumbnail-node replacements. An additional
candidate-only observer through the late publication found about 284ms with some
current thumbnail area unready, a maximum 96% unready area, and a completed wait
about 271ms. All 27 images recovered. This is loaded/decode evidence, not proof of
blank painted pixels or an isolated paired remount cost. The observer cannot count
wholesale replacements; the companion journey supplies that separate witness.

This is why extra requests alone are not the objection: useful current images can
become unready later even though the first-ready clock is good. Native-cache and
paint limits remain explicit; do not convert the warmed, HTTP-cache-bypassed result
into a universal cold-photo prediction. Likewise, do not make the accepted extra
page finish by first decode merely to obtain an all-green metric.

**Disposition after adoption:** Grid/Table are the selected initial scope. Accept
or address the demonstrated Justified late cost before including it.
Further Justified work should protect current thumbnails across late publication,
not re-prove the metadata-wall benefit or start a scheduler/fragment rewrite by
assumption. This qualification study itself changed no product policy. The subsequent
implementation above preserves non-wheel/seek/maintenance behavior; future expansion
still requires its own regressions, full gates and independent review. Compatible
campaigns remain operator-run.

### Initial Runway Is Separate

`b2UninterruptedResearch20261021` separates starting availability from steady lead
time. With 201 Justified images and 83 results of runway, both 400ms and 1,000ms
horizons blocked about 339-341ms under 900ms delivery. A larger horizon cannot make
the first response arrive before insufficient initial runway is consumed.

Ready-runway controls loaded an extra page **before timing in both arms**. They do
not establish free startup prefetch or an acceptable navigation wait. If first-entry
blocking remains important, explicitly decide admission timing, seek/history
coexistence, exposure delay and short-stop cost. Never delay metadata publication
for thumbnail completion or silently withhold ready results.

The 1,000ms result is a conditional Justified alternative, not the default patch.
With ready runway it kept sampled non-rigid geometry below 0.016px where 400ms
backward controls moved up to 1,466px and censored endpoints. However, backward
frame-p95 worsened about 25.5-26.2 to 32.8-33.3ms and exposure increased. Grid had
zero walls under both horizons, giving no demonstrated reason to widen it.

## Research Questions and Fixes to Ponder

**DONE means the named, demonstrated defect is repaired, not that its entire
performance domain is solved.** Open work is ranked for the next decision; it is
neither blanket implementation approval nor a new set of prerequisites for B2.

| Status | Question or fix | Current evidence and disposition |
| --- | --- | --- |
| NEXT | Does one eager row above improve unseen backward entry? | Compare two-below against two-below/one-above in Grid and Justified with metadata policy fixed. Include forward motion, reversal, stopped recovery and refresh costs. Lower-band and retention studies do not answer this; no retention or scheduler change is included. |
| WATCH | Why do constrained Grid/Justified landing cohorts sometimes change? | Earlier revision-4 runs censored 3/4 Grid and 2/4 Justified landings; the latest canonical campaign recovers 4/4 in both layouts without cohort changes. Retain the earlier phenomenon, not a claim that it remains reproduced in every checkpoint. If it recurs, associate stopped cohorts/retained boxes with publication, viewport and edge membership; do not relax the check or call it a timeout. |
| OPEN | What causes Justified visible boundary repacking? | A block changing from 4 known dimensions to 48 moves/resizes a previously correct image while its source and centre anchor remain correct. Earlier metadata can move work offscreen, not guarantee stability. True-ratio fragments remain a feasibility result with unresolved lifecycle. |
| SELECTED | Which layouts initially use backward prediction? | Fixed Grid/Table now use bounded 400ms prediction; Justified remains at 50 because late publication can make current thumbnails unready after an apparently good stop. One bounded speculative page is accepted; an early ready clock is not universal continuity. |
| **DONE** | Table detached-request ownership defect | Reproduced missing source release, qualified shared/completed/re-entry consumers and implemented URL-scoped passive cleanup. Production controls recover 29/29 images around 2.1s versus 0/29 at cap; reversal adds 39 repeated starts. Latest canonical D8 recovers 4/4 around 1.28s, without isolated causal attribution. **Remaining:** sustained moving delivery, not another cleanup investigation. |
| **DONE** | Demonstrated Grid/Table render-work defects | Removed repeated locale setup, duplicate derivation and retained-row model-identity churn; moved Grid date work behind memoization. Bounded synthetic/live DEV rechecks support the repairs. **Remaining:** paint/arrival/enrichment and long/constrained workloads, not assumed further formatter or renderer work. |
| **DONE** | P13b retained Grid callback churn | Image-only route changes invalidated three handlers across 84 retained cells. Latest-param reads remove the renders while preserving strict placement. First-return DEV work improves; no clear warmed-return latency gain or canonical speedup established. |
| **DONE** | Dashboard provenance and evidence presentation | Member-consensus source metadata, actual baseline membership, adverse recovery flags/counts, frame populations and explicit delta/boundary labels are implemented. **Remaining:** unavailable request-to-current-image associations and joint censor reasons cannot be inferred from aggregates. |
| OPEN | Does mounted background demand still impede useful delivery? | Cleanup removes abandoned consumers, but moving readiness remains poor. Attribute current demand before selecting visible-first native admission. Delaying `src` changes admission even when `loading` remains eager. |
| DEFERRED | Does local proxy behavior need improvement? | Actual-handler controls show full-body buffering, no client-close abort and no in-flight miss coalescing. Operator excludes proxy redesign from this work. Any later coalescing/streaming/abort decision must preserve or explicitly change cache warming and measure benefit. |
| OPEN | What changes on the hosted client and native caches? | Bounded deployed-API/canonical-photo evidence now exists, but the UI is local DEV. It does not certify the hosted production build, HTTP2, signed-URL expiry, native-cache behavior or shared consumers; do not copy laptop HTTP1 limits. |

<a id="active-plan"></a>
<a id="potential-next-steps"></a>
<a id="next-discriminating-work"></a>
### Priorities Beyond the Selected B2 Scope

The upper-row comparison is next. The remaining questions are follow-ups, not
prerequisites or permission to expand its implementation scope:

1. **Next: one eager row above**, retaining the two-below baseline for comparison.
  If useful, distinguish directional benefit from simply issuing more requests
  with a budget-matched alternative. Include forward motion, reversal and refresh
  costs. This has not been tested by lower-band or retention studies; do not
  assume native lazy loading already supplies the same lead.
2. **Publication-time work:** if noticeable pauses remain after B2, attribute a
  current production-build publication before selecting another optimization.
  Separate React work, geometry/measurement, layout and media/decode from DEV and
  probe amplification. Existing formatter, retained-row and callback defects are
  repaired; their historical profiles do not justify repeating those fixes or
  automatically caching more layout work.
3. **Initial directional runway:** at 200 results/s, 90 ready results last 450ms,
  less than a 900ms read. A longer predictor alone cannot fix that first gap.
  Existing ready-runway evidence already demonstrates the distinction. Any
  direction-aware destination preparation must explicitly trade navigation delay,
  extra reads and short-stop cost; do not silently expand startup fetching or
  delay publication until media is ready.

Mounted-demand attribution remains a prerequisite for a scheduler proposal, not
for B2. Delivery sizing/quality, proxy redesign and a general retention framework
remain separate choices without established benefit from this study.

### Library Research Disposition

Installed manifests and lockfile agree on React adapter 3.14.13 / virtual-core
3.17.11. The supported sparse-selection mechanism already exists, illustrated by
the [matching-tag sticky example](https://github.com/TanStack/virtual/blob/%40tanstack/react-virtual%403.14.13/examples/react/sticky/src/main.tsx).
Installed extraction memoizes on callback reference, overscan, count and range
endpoints; a hidden ref mutation alone is insufficient. Keyed anchoring capabilities
are also already installed, but current views do not provide virtualizer item keys.
Table's React image-ID keys are a different identity layer.

The bounded upstream review found newer anchoring/cancellation fixes, not evidence
that an upgrade repairs the current custom-compensation path. `anchorTo` would be
an alternative placement owner, not an additive toggle. No upgrade, virtualizer
migration or internal scroll-offset mutation is justified by these results alone.

### Justified Geometry: Feasible Alternative and Limits

The true-ratio fragment control in `b2UninterruptedResearch20261021` preserved
known rows and independently packed incoming images at actual ratios. Four
mixed-ratio unit cases and a stopped backward-publication compositor control
support feasibility: 32 retained targets stayed stable, the previously moving
point shifted about 0.37px vertically, and all 1,000 loaded boxes respected ratios.
This is **not** a general fragment lifecycle or blocking fix.

Selection still requires repeated/moving publications, both boundaries, partial
eviction, release/coalescing, true ends, bounded state, resize/density/seek/history,
and consistent row lookup, keyboard neighbours, hit targets and extent. Incomplete
rows can leave horizontal space and add height. Use applied-input observers and
calibrated pixel controls: the old DOM observer missed common-mode movement, and
none of these controls establishes every-frame paint coverage.

**Do not revive provisional square-slot retention.** It preserves old boxes by
giving new visible images unsuitable shapes. Original-cohort departure, timers,
idle and media readiness do not make release safe when other block members remain
visible. Lifetime research establishes that constraint, not an implementation recipe.

<a id="revision-4-campaign-assessment"></a>
<a id="active-pressure-campaign"></a>
## Campaign Evidence That Changes the Plan

### Historical Revision-4 Diagnosis

**Scroll load and recovery v4**, timestamp `2026-10-22T23:01:03.116Z`, HEAD
`2fb9bf3ee` with dirty tree, is the pre-render-repair diagnostic baseline. Four
repetitions completed 36 workloads/84 records: local media-api, seek mode,
Chromium 151, 1720x960/DPR2. Capture/coverage passed; paint is unmeasured. These
observations are not current post-Table-cleanup measurements.

| Observation | Retained meaning |
| --- | --- |
| At requested 200 results/s, backward progress is 149/134/148 results/s and walls 699/915/715ms for Grid/Justified/Table. | B2 remains material after Grid/Justified cleanup. Phase medians are not universal thresholds or episode durations. |
| Constrained 100 results/s: median pending slots 88/84/92%, zero metadata walls in every repetition. At 200, all reach 100% pending and walls appear. | Delivery and metadata continuity are separate. Earlier metadata alone cannot cure unready pictures. |
| Ordinary forward decode medians 365/810/341ms; worst Table 2.20s. D2 short-reversal landings 27/21/53ms. | Revisiting recent content does not establish unseen-entry performance. Do not add data/media clocks or omit adverse repetitions. |
| Constrained stable decoded endpoints: Grid 1/4, Justified 2/4, Table 0/4. | Grid/Justified censor on cohort changes, not four-second decode timeouts. Table retains its cohort but misses the cap. No survivor-only latency median. |
| Grid/Table exceed 33.4ms at every load step/repetition; Justified has adverse backward/reversal geometry. | Historical motivation for attribution, not proof that repaired Grid/Table still have the same frame defect or an overall density winner. |
| Ordinary Justified forward at 100 results/s: about 0.2% median pending slots, 64% worst repetition. | Median readiness and comfortable initial runway do not establish reliable sustained supply. |

Initial windows contain 201 images and about 83-92 results of runway; gentle
motion largely consumes prepared content. Four-sample p95 is the worst repetition,
not a population tail. Table slot counts are not whole-viewport pending area.

### After-Rendering Canonical Comparison

The four 24 October entries and four 25 October entries in campaign
`ee34e38f-0d8a-48d1-b1b6-05b2dba776e1` (**after rendering fixes**) have matching
78 scenario IDs, contracts and four-observation populations: 34 rendering,
15 short, 8 long and 21 density scenarios. Topology, canonical media, browser,
viewport/DPR, cutoff and worker/CPU settings match; source, content and cache
warmth are not controlled. All 6,100 density field summaries have consistent
sample/unavailable totals; browser sidecars match canonical JSON.

- **Table delivery lead, since repaired locally:** D8 retained a median 28 images
  but decoded-count median/maximum zero. Global request carry-in rose 293.5 to
  314.5 and end-pending 164 to 172.5; data-ready was 16.75ms under a 4s recovery
  cap, with no recovery failures, HTTP errors or cohort changes. These counts
  motivated ownership qualification, not proof of which requests were obsolete.
  The subsequent Table cleanup is not measured by this campaign.
- **P13b lead, since attributed locally:** frame-p95/max improved 100 to 59ms and
  LoAF blocking 48 to 6ms over roughly six frames. This is not action latency.
  The later callback repair has local evidence below, not a new canonical result.
- **No established client defect from full-image waits:** JA2 loaded/stable
  settlement rose 6,474 to 11,762ms while store-ready fell 134 to 117ms; P13c
  decoded detail rose 1,374 to 1,884ms; P14c fast-backward landing 2,695 to
  3,560ms, with loaded-within-cadence 2/10 to 1/10. These canonical-media results
  cannot be attributed to the local proxy. Do not add clocks, equate
  loaded/decoded/painted, or infer backend costs from landing Resource Timing.
- **No p95-only regression verdict:** P15b is fullscreen traversal, not return.
  Its p95 rose 10 to 22ms, but max fell 50 to 34ms, blocking 15 to zero and
  frame count 157 to 57. Changed window composition matters.

Nine D1/D2/D8 records changed contracts in revision 4. D3-D7/D11 retain twelve
comparable records; the new 100-results/s step is not the old continuous journey.
Do not calculate a cumulative speedup across that boundary. Comparable seek
medians improved 2082 to 1353ms Grid and 1994 to 1762ms Justified while maintenance
frames and paired refresh decode penalties worsened (7 to 73ms and 45 to 109ms).
Both campaigns already had Grid/Justified cleanup; this is not another controlled
cleanup intervention. Campaign labels can precede eventual commits: use contracts
and provenance, not commit order alone.

<a id="latest-canonical-checkpoint"></a>
### Pre-B2 Canonical Checkpoint

The newer full campaign **more rendering fixes to grid and table**
(`a831e391-5207-494b-aff3-0331877ffd79`, 25 October) measures the subsequent
Table/callback repairs. Compare it with **after rendering fixes** above, not an
unmatched local/proxy run. Both are complete four-repetition campaigns with
matching deployed-TEST/canonical media, Chromium 151, 1720x960/DPR2, cutoff,
worker/CPU settings and workload contracts. Source snapshots differ:
`aa9b9d80b` / dirty `f9bdada526dac5f3` versus `cc9230fa7` / dirty
`a38ebd40bf6a3117`. Content and cache warmth remain uncontrolled; these are
descriptive checkpoints, not isolated causal interventions.

| Signal | Earlier checkpoint | Latest checkpoint | Consequence |
| --- | --- | --- | --- |
| P13b return frame-p95/max | 59ms, severe-frame aggregate 1 | 21ms, severe-frame aggregate 0; focus preserved | Canonical frame evidence now supplements the local callback attribution, without proving warmed latency or universal speedup. |
| D8 constrained Table recovery | 0/4 completed | 4/4, median 1283ms | Post-repair canonical recovery is recorded; it is no longer an unmeasured follow-up. |
| D8 Grid / Justified recovery | Grid 4/4 at 1882ms; Justified 3/4, aggregate latency withheld | Both 4/4, medians 1689 / 1818ms, no cohort changes | Historical cohort censoring is not the latest outcome. |
| D8 strongest-step Table progress | 114 results/s, 855ms walls | 196 results/s, 13ms walls | Useful progress improves descriptively; moving readiness and frame costs remain separate. |
| D8 strongest-step Grid / Justified pending area | About 61% / 97% | About 61% / 97%, at roughly 200 results/s | Better recovery does not solve useful moving-image delivery. |

Use the latest checkpoint as the available pre-B2/retention product baseline;
neither proposed product policy is enabled in it. Preserve older campaigns and
adverse observations. No new full campaign is needed merely to re-prove the wall
or repeat already-recorded post-repair coverage.

### Scoped B2 Forward-Recovery Assessment

**Unresolved adverse signal:** the **Scoped B2 Grid Table** campaign
(`05a03af7-b064-4719-84e0-1b8a132ad203`) worsened D1 forward image recovery
against the pre-B2 checkpoint above. Contracts/environment match, with four
observations each, but photos and cache state are not controlled. Rounded medians
from the [canonical density log](../../e2e-perf/results/density-log.json):

| D1 signal | Grid | Justified |
| --- | --- | --- |
| Stopped visible-image decode readiness | 159 -> 384ms | 201 -> 617ms |
| Stress-phase image request starts | 666 -> 666 | 677 -> 706 |
| Stress-phase completed image requests | 566 -> 201 | 552 -> 282 |
| Stress-phase cancelled image requests | 66 -> 400 | 72 -> 322 |
| Image requests pending at the stop | 37 -> 69 | 42 -> 81 |

The cancellations rise within the fixed three-second 200-results/s phase, not
merely a longer recovery window. All stopped cohorts recover 4/4; stable-data
readiness stays around 9-15ms and frame-p95 is similar. Successful-request duration
averages exclude cancellations and cannot establish healthy delivery or paint.

**Attribution remains open:** neither layout issues backward reads/prepends;
Grid traverses the same 996 results with six forward reads. A high-demand
delivery/request-lifetime limit is plausible, not proven. Setup passes through
Table, whose policy changed; source totals differ by about 60 records and Justified
packing also differs. Only aggregates survive, preventing per-run or stopped-image
correlation of cancellations and recovery.

#### Bounded Shared-Tab Follow-Up

The evidence key `b2ForwardSharedBrowser20261025` retains four attempts at matched
1720x960 viewport/screen and DPR2, with exact repeated Grid setup:

- **No on/off comparison:** counterfactual interception timed out before measurement.
- **Two rejected Grid captures:** stopped cohorts changed and request clocks were
  invalid; one capture had four completion timestamps preceding starts by up to 5s.
  A successful local request control did not validate these live lifetimes.
- **Lighter Grid/Justified observations:** recovery was 409/580ms, but stable
  data/placement took 260/151ms and frame-p95 was 117/175ms. This is not the
  campaign's failure signature. Removing the detailed relay did not restore its
  cadence; the lighter observer cannot establish cancellation counts. Neither
  observation showed a new visible-image readiness loss in the next two seconds.

These attempts did not resolve the adverse campaign signal. Further attribution
needs reliable request clocks and a same-photo/same-runway policy comparison in
both orders, observing through late publication. It is not a prerequisite for the
upper-row comparison; do not repeat the inconclusive setup or reopen general retention work.

## Completed Render Repairs and Retained Evidence

**DONE: the demonstrated repeated render/formatting work is removed.** Grid
shares two Intl date formatters and computes caption/tooltip dates inside its
cell memo boundary; image-only Justified cells skip dates. TableRowCells takes
stable image/column/enrichment/handler inputs, not volatile TanStack Row objects;
outer rows also avoid Row identity churn. Display/tooltips share accessor output,
and numeric fields reuse one default-locale number formatter. Table date-fns,
headers, bounded model input, focus/selection, enrichment and geometry stay intact.

### Why These Repairs Were Selected

| Control | Useful evidence | Limit |
| --- | --- | --- |
| Resident/predecoded Grid/Table with minimal observers | Warm Grid frame-p95 about 58ms and Table 133ms persisted without result publications/read starts. Profiles implicated Grid date work and Table enabled-cell/React work. | DEV, short passes; profile windows include setup. No paint/raster or production-build attribution. |
| Grid exact-option native/reuse/reuse/native formatting | Output parity held; native frame-p95 50.0/41.7ms versus reuse 16.7/9.3ms. Actual formatter fix recheck 16.8/9.4ms. | Demonstrates repeated locale setup in this reproduction, not the entire historical frame gap. Table uses different date formatting. |
| Table original/thumbnail/selection/date/numeric column controls | Original 23-column frame-p95 50.0/58.3ms; thumbnail 16.7/25.0ms; selection 16.7/16.7ms. Date/numeric-only arms did not explain the whole gap. Retain the original 117ms worst interval. | Enabled-cell work matters; not zero row/virtualizer cost or justification to remove useful columns. |
| Retained-row native/semantic reference control | Only `row` changed for retained images. Native 2,376-3,026 row-body calls versus semantic 156-158; semantic p95 16.7-17.5ms versus native 33.4-75.0ms. | Diagnostic comparator is not shipped: image identity alone cannot cover column/model, metadata, selection or enrichment changes. |

The retained-row control used local mock data, 400 residents, 200 predecoded
synthetic thumbnails, seek mode, 1720x960/DPR2, 27 initial Table rows and fixed
80-result work. Achieved rates differed (about 91-101 results/s), so it is not
an exact matched-rate benchmark. Declared geometry/text/tooltips matched; no
pixel/paint witness was taken. Observer-present diagnostics are not observer-free
browser attribution.

### Implemented Results

Final isolated controls retained the same 400-result array, predecoded media,
viewport and fixed 80-result work, with no publications or pending endpoint media.

- Table production row-body/title counts were 160/160/158, frame-p95
  17.7/17.2/16.7ms; the semantic comparator found no remaining Row churn to skip.
  Retain the 25.1ms worst interval and 2.7ms thumbnail-observer maximum.
- Grid date calls fell from 6,552 to 504 per pass; measured formatter work from
  11.1ms to 1.2/0.8ms. Both already had about 16.7ms frame-p95: this follow-up
  saves CPU, not an established further frame-cadence improvement. Justified
  performed zero date calls. Numeric reuse has parity/allocation coverage, not
  separately isolated frame-speed attribution.
- Direct memo counters found all 3,144/2,940 retained Grid comparisons and
  4,338/4,269 Justified comparisons skipped in steady-window motion. No handler
  churn was observed there; detail-return churn is a separate mechanism below.

A bounded foreground live DEV recheck verified served source hashes, ApiDataSource,
deployed TEST/canonical media and 1720x960/DPR2. Ten fixed-work passes used 400
residents and about 80 calibrated results each, with zero read starts/publications
and no intervals above 33.4ms. Caches/enrichment were not independently controlled.

| Live DEV condition | Frame-p95 ms | Worst interval ms |
| --- | --- | --- |
| Grid ordinary / explicitly prewarmed | 24.9 / 9.1 | 25.1 / 16.6 |
| Table ordinary / explicitly prewarmed | 17.6 / 16.7 | 25.3 / 25.5 |
| Justified ordinary / explicitly prewarmed | 9.4 / 9.2 | 16.8 / 16.7 |
| Table full columns, bracketing thumbnail-only | 17.4 / 16.8 | 25.1 / 25.0 |
| Table thumbnail-only, two observations | 8.7 / 9.1 | 16.7 / 9.4 |

The former large warm Grid/Table penalty was not reproduced. Full Table retains a
smaller metadata-cell cost; no exact browser-subsystem diagnosis or further rewrite
follows. Historical/current observations are not randomized paired speedups, hosted
or production-build results, population tails, constrained-delivery or paint proof.
Table's 27 usable rows and the media helper's 29 intersecting images are different
populations. Remaining approximately 1ms Grid formatting work does not justify extra
caches without a newly measured bottleneck.

### P13b Return Attribution and Callback Repair (25 October 2026)

**DONE: image-only route transitions no longer invalidate retained Grid handlers.**
`enterDetail` reads the existing latest-params ref at invocation. Cursor capture,
history, focus, wrapper visibility, return placement, density and interruption
owners are unchanged. The regression failed first on onCellClick,
onCellDoubleClick and onTickClick changing across 84 retained cells, causing 168
DEV render calls; after repair all 84 comparisons skip, with zero retained renders.

Local controls used mock data/400 residents, 84 decoded synthetic thumbnails and
decoded detail, 1720x960/DPR2, real Backspace/history return and the existing stable
focused-destination boundary. Focus, list URL, buffer, exact scrollTop and relative
placement within 1px were preserved. No live service or canonical campaign ran.
Actual canonical probe/boundary bodies were reused without executing the live spec.
The initial large cost was script, not the wrapper's layout/paint; a separate CPU
sample implicated DEV JSX/Strict Mode.

| Traced first-return aggregate, four observations per condition | Historical callback | Repaired callback |
| --- | --- | --- |
| Key-to-stable median | 85.6ms | 46.95ms |
| Median per-observation frame-p95/max | 62.25ms | 17.2ms |
| LoAF blocking median | 7.1ms | 0ms |
| Script excluding nested layout/paint range | 50.95-56.54ms | 13.06-15.85ms |
| Layout / paint ranges | 5.69-7.06 / 4.61-4.97ms | 6.03-7.70 / 4.22-4.86ms |

A tracing-disabled pair also improved (key-to-stable 91.5 to 38.8ms, frame-p95/max
57.8 to 16.7ms, LoAF 8.6 to zero). A warmed counter pair showed **no clear latency
gain**, about 36 versus 40ms, despite removing renders. First-use DEV amplification
must not become a universal warmed or production-build claim. Small frame samples
are not population tails. Do not chase ordinary remaining layout/paint or rewrite
restoration on these results. Raw traces/profiles were not persisted; accepted
observations and exclusions live under `p13bReturnAttribution20261025`.

### Product Validation

Current full gates passed: **3,260 units across 92 files at default parallelism**,
and **506/506 local E2E with three workers and retries disabled**. Performance
TypeScript and focused research controls passed. The media-fallback fixture now
publishes changed mock inputs explicitly; the Justified maintenance fixture waits
for extension readiness before manual filling. Behavioral assertions and timeouts
remain unchanged. These gates validate workflows, not hosted performance or the
remaining delivery/paint questions. Implementation history belongs in the
[changelog](changelog.md), not this guide.

<a id="post-lookahead-campaign"></a>
<a id="post-cleanup-campaign"></a>
## Earlier Repairs: Evidence Worth Reusing

| Repair | Evidence | Limit |
| --- | --- | --- |
| Maintenance-safe velocity / B1 validity | Spurious D9 forward starts fell 1 to zero; historical P17 backward reads/prepends two to one. | Removing false work did not remove Justified walls. |
| F1 admission/render isolation | Justified ordinary frame-p95 returned about 24-25 to 17ms. | Not delivery priority or backward runway. |
| Two lower eager rows | Same historical D8: pending area 13.66 to 0.14% Grid, 36.63 to 2.95% Justified; matched entry controls support the mechanism. | Sustained, reversal/frame/refresh costs remain; no upper-row comparison. |
| KUP-042 | Fixed-row membership/compensation protected by all-visible-box regressions. | Not Justified packing or universal speedup; intervening changes/transport confound the office-network campaign. |
| Table row identity | Revision-3 replacements fell 2624 to 22.5 forward and 2168 to 108 backward; late pending slots improved. | Stable elements did not resolve the later request-lifetime defect or all delivery/frame work. |
| Grid/Justified cleanup | Active cancellation and fewer outstanding requests; native-photo controls support conditional stopped readiness/progress benefit. | Same-contract campaigns were mixed, including worse Grid frames and adverse Justified geometry. No upstream-savings claim. |

<a id="delivery-options-decision"></a>
## F2: Implemented Cleanup and Remaining Delivery Work

Cleanup is product baseline in Grid, Justified and Table. Remove `src` only from
a captured detached, incomplete image; preserve connected Strict Mode replay,
completed images, shared native consumers and re-admission. Production behavior
is covered by [ordinary lifecycle tests](../../e2e/local/thumbnail-lifecycle.spec.ts);
pressure controls belong in research, not habitual E2E.

`f2NativeComparisonTimingV220261022` is the usable matched native-photo result.
In two treatment orders under 80ms/4Mibit pressure, Justified cleanup reduced
stopped readiness about 5.0-5.6s to 2.2-2.4s and blocking 2.5-3.0s to 1.1-1.3s.
Frame-p95 worsened about 67 to 75ms, moving pending slots stayed above 90% and
both policies retained adverse geometry. Warm unthrottled arms established no
benefit; the first cold-proxy arm is confounded. This is not Grid, hosted-CDN,
native-trackpad or long-churn proof.

Retain the small lifetime fix, not a claim that F2 is solved. Do not repeat warm
arms looking for a win or expand cancellation without a named ownership problem.
A passed-by image may be useful again; strict centre-out completion or deliberate
withholding of ready images is not required.

### Table Ownership Qualification (25 October 2026)

**DONE: the actual Table renderer had a missing request-release defect, now
repaired.** A held request remained unfinished/unaborted after its row detached;
source-release coverage failed first. Production TableThumbnail now uses passive
detached/incomplete cleanup, following URL changes because an initially absent
URL can mount the image later. Native lazy loading, overscan, dimensions, URL
selection and error behavior are unchanged. Controls protect connected rerenders,
Strict Mode, shared consumers, completed images and re-entry.

Production pressure controls compare cleanup with a narrow cleanup-disabled
counterfactual in both treatment orders. Local mock metadata, 400 residents,
373-result runway, 1720x960/DPR2, exactly 6400px at requested 100 results/s,
80ms/4Mibit pressure and 24,698-byte padded SVGs over loopback HTTP1 are held
constant. Setup is drained/unthrottled; stopped paths match and data stays unchanged.

| Forward outcome | No cleanup | Production cleanup |
| --- | --- | --- |
| Detached-only pending at stop | 120 / 120 | 0 / 0 |
| All pending at stop / after recovery | 163/79 and 163/80 | 44/0 and 43/0 |
| Decoded endpoint | 0/29 at four-second cap in both arms | 29/29 at 2099.4 / 2106.1ms |
| Frame-p95 / worst interval | 18.6/25.1 and 17.3/25.9ms | 17.2/25.2 and 17.5/25.6ms |

Every pending request was associated with an element/path at the stop sample.
All arms had 27 usable current pending slots and 16-17 mounted-offscreen requests;
the readiness observer counts 29 images including the sticky-header band. Neither
population is the canonical D8 28-image aggregate, and this is not an atomic
request-conservation timeline. Earlier equivalent fixture-only controls agree;
their adverse 91.4ms baseline interval remains in the evidence record.

A matched 6400px forward / 1600px backward pair quantifies a real reversal cost:

| Reversal outcome | No cleanup | Production cleanup |
| --- | --- | --- |
| Current decoded endpoint | 9/29 at cap | 29/29 at 1983.2ms |
| Request starts / repeated starts | 200 / 0 | 239 / 39 |
| Detached-only pending at stop | 94 | 0 |
| Pending after recovery | 69 | 2 |
| Cancellations through recovery | 0 | 185 |
| Frame-p95 / worst interval | 17.1 / 25.3ms | 17.1 / 25.0ms |

The 39 re-requests were not free, but did not erase this pair's current-image
benefit. Two pending requests after current decode are not failed current images.
Moving exposure stayed about 92%; sampled resize remained 28px, displacement/walls
zero. Candidate failures were cancellations, with no HTTP errors or failed visible
media. This does not establish universal reversal/frame non-regression, paint,
live/canonical recovery or upstream savings. Completed bytes use different recovery
end times and omit partial cancelled transfers; they are not matched-budget savings.

No independent lazy-admission defect was found. A scheduler, mounted-source sweep
or buffer change does not follow from this lifetime repair. Full gates and lifecycle
coverage passed; a representative post-fix delivery comparison is separate work.

### Approaches Not to Adopt by Default

- Dynamic in-flight `fetchPriority` demotion produced **0 demotions for 332 pending
  High requests** while natural promotions verified collection. Initial hints
  working does not establish mutation uptake; revisit only a changed mechanism/runtime.
- An imperative mounted-image `src` sweep left the same node blank on reversal:
  unchanged React props did not restore it. Admission needs declarative re-entry ownership.
- Fetch/blob brokers add full-body latency, CORS, deduplication and object-URL
  lifetimes. Native cross-origin images can work where opaque fetch blobs cannot.
  A queue library/worker does not supply current-demand ownership.
- A blanket 150-image backward floor produced three reads/600 hits after a short
  stop without avoiding a stall. Do not use it as fallback.
- Larger buffers, global key rewrites, guessed visible ratios, async hints and
  universal horizon increases have no established general benefit. Quality,
  format, sizing and layout-engine changes are separate decisions.

Actual proxy controls show whole-body buffering, no client-close abort and no
in-flight miss coalescing. Browser cancellation can free local capacity while the
proxy continues warming cache; immediate reacquisition can duplicate a miss.
Streaming/coalescing/abort propagation and HTTP2/separate origins remain separate,
operator-authorized trade-offs, not B2 dependencies or retroactive savings proof.
[KUP-041](bug-backlog.md#kup-041) owns API-to-ES read cancellation, not native-image
lifetime. The [TEST plan](kupua-TEST-deployment-plan.md) owns canonical URLs/expiry;
the [imgproxy assessment](01%20Research/imgproxy-research.md) concerns future preview/zoom
delivery and does not block today's thumbnails.

## Dashboard Evidence: Completed Corrections

**DONE:** checkpoint source metadata now requires complete member consensus,
baseline long-run coverage follows membership, and recovery shows adverse flags,
visible/decoded counts and global request carry-in/pending/completion/cancellation
evidence. Partial latencies remain withheld. Image summaries include frame counts,
p95, worst frame, LoAF and saved boundaries. Layout deltas subtract matched-layout
medians; D11 deltas are within-repetition pairs. New JA2 labels say loaded/stable;
historical labels remain intact. Offline/local-browser regressions cover these rules.

These repairs expose existing evidence without new campaigns. They do not associate
global requests with current images or recover unavailable joint censor reasons.
Do not subtract separate medians/aggregates into synthetic timelines. Campaign
**after rendering fixes** retains original metrics, provenance, IDs and membership;
its label is not evidence of a controlled causal experiment.

## Evidence and Reuse Map

Preserve observations, exclusions and provenance in the existing
[research JSON](scroll-horizons-thumb-lookahead-results.json). Do not rewrite old
`nextDecision` fields as current authority or create a duplicate results ledger.

| Evidence | Reuse for |
| --- | --- |
| `retentionValueLocalHttp20261025` | Final weak-reference 52-observation value study, observed blocking gates, independent per-layout decisions, loaded/decode-ack separation, inner-key counterfactual and remaining parent/cell failures. |
| `publicationRetentionGridJustified20261025` | Unchanged-key C versus stable-key CK, first-publication node lifetime, scoped unclamped row identity, release and bounded extra rows; not readiness or performance benefit. |
| `publicationRetentionTableC20261025` | Table survival counterfactual, sparse-cache collision, constant-count extractor invalidation and latched release limits. |
| `publicationIdentityCurrent20261025` | Current-source committed virtual-range exclusion and new image elements across Table/Grid/Justified; separates actual DOM, render attempts, row membership, source identity and paint limits. |
| `b2QualificationClosure20261025` | Calibrated Table/far-seek controls, matched canonical Table and high-demand Justified comparisons, late-publication exposure, accepted costs and recommended initial scope. |
| `b2SharedConsumerFollowUp20261025` | Historical partial checkpoint: priority/seek contract and original measurement failures; its Table blocker is resolved by the newer qualification. |
| `b2CurrentBaseline20261025` | Unchanged local 400ms controls on the repaired baseline; bounded canonical Grid/Justified pairs, demand calibration, adverse costs, shared Table scope and explicit acceptance gaps. |
| `b2LocalComparison20261020`, including `justifiedAfterSetupRepair` | 400ms candidate, short-stop/slow/fast costs, both orders, reversal/capacity. |
| `b2LiveBoundary20261021`, `b2TierReproduction20261021` | Metadata releases walls before thumbnail readiness; indexed missing-data exposure with/without map; resident true ends. Recipes are viewport-specific. |
| `b2Publication20261021`, `b2StabilityFilmstrip20261021` | DOM replacement identity, applied-input/anchor controls, calibrated geometry and paint attribution. Original Grid realignment predates KUP-042. |
| `b2GeometryLifetime20261021` | Unsafe original-cohort release, dimension invalidation, forward negative controls; provisional slots withdrawn. |
| `b2UninterruptedResearch20261021` | 400/1,000ms and initial/ready-runway comparisons, true-ratio feasibility and unresolved lifecycle. |
| Initial lookahead rows, `frameAttribution`, `decodingHint`, `scrollLookaheadMatched`, `refreshLookaheadMatched` | Lower-band choice, arrival work, no demonstrated async-hint benefit, sustained/reversal/refresh costs. |
| `f2RequestOwnership20261022`, `f2PriorityUptake20261022` | Late once-useful demand, metadata association and failed dynamic demotion; not pure queue/eager-band attribution. |
| `f2DeliveryOptions20261022` | Native lifetime/re-entry/shared consumers, HTTP1 capacity, fetch/blob and actual proxy controls. |
| `f2CleanupCampaign20261022`, `f2NativeComparisonTimingV220261022` | Mixed canonical results and bounded native-photo cleanup benefit/cost. |
| `f2TableOwnership20261025`, especially `productionFollowUp` | Reproduced Table defect, production pressure counterfactual, reversal re-request cost and limits. Initial recommendation fields are historical. |
| `p13bReturnAttribution20261025` | Retained callback mechanism, first-use/warmed/probe/tracing distinctions, accepted measurements and exclusions. |
| [Existing research spec](../../e2e-perf/research/density-app-research.spec.ts) | Render/reference/date-work controls and their failure-first production regressions; reuse fixtures/probes rather than creating another harness. |
| [Density](../../e2e-perf/results/density-log.json), [rendering](../../e2e-perf/results/audit-log.json), [perceived](../../e2e-perf/results/perceived-log.json) histories | Recorded live baselines and navigation/traversal guardrails; check scenario contracts and campaign membership before comparing. |

Important exclusions: early embedded recovery clocks crossed controller round trips;
early publication screenshots missed pending decode; repeated-image delay did not
exercise its hold; the async-hint collector lacked fresh-document lifetime accounting.
The six-second native baseline had real walls but never reached its endpoint, so it
is not a matched recovery comparison. Initial P13b no-probe frame summaries omitted
the keydown-straddling interval; their marked trace clocks remain valid, but those
frame summaries are excluded. Failed/in-flight-changing setups supply no performance
result. Never pool them with corrected captures or rehabilitate them via later success.

Methods live in [local controls](../../e2e-perf/research/controls.md), detector checks
in [validation](../../e2e-perf/validation/README.md), and metric contracts in the
[measurement reference](../../e2e-perf/measurement-reference.md). Do not copy setup
transcripts, test-run chronology or commands here.

The [pinned Immich study](https://github.com/immich-app/immich/commit/53618ff7496ee313d1cff7b3bcdf19c82b765cdf)
found a month-index/placeholder model and same-origin URL-keyed worker, not a
drop-in arbitrary-sort cursor-window/CDN scheduler. Reuse current-demand protection,
deduplication and late-write rejection principles, not that architecture. The
installed WASM package provides geometry, not delivery policy.

## Contracts and Validation

| Owner | Preserve |
| --- | --- |
| [Data window](../../src/hooks/useDataWindow.ts), [tuning](../../src/constants/tuning.ts) | Directional demand, first-row validity, maintenance-safe velocity and scope resets; no silent indexed/forward change from a backward mirror. |
| [Scroll effects](../../src/hooks/useScrollEffects.ts), [search store](../../src/stores/search-store.ts) | One placement owner, generation guards, legitimate programmatic demand, 200-image pages, 1,000-image retention and one extension per direction. Metadata never waits for images. |
| [ImageGrid](../../src/components/ImageGrid.tsx), [Justified layout](../../src/lib/windowed-justified-layout.ts) | Eager/overscan policy, true ratios, authoritative metadata/permissions, bounded geometry and consistent render/navigation coordinates. |
| [Image URLs](../../src/lib/image-urls.ts), [traversal](../../src/hooks/useImageTraversal.ts), [prefetch](../../src/lib/image-prefetch.ts) | Shared-current-consumer protection, source validation and independent full-image traversal semantics; thumbnails do not certify detail delivery. |

<a id="fixed-grid-continuity"></a>
KUP-042's [fixed-row policy](00%20Architecture%20and%20philosophy/03-scroll-architecture.md#fixed-row-window-policy)
remains the contract; [its backlog entry](bug-backlog.md#kup-042) retains the original
reproduction. Image resizing/arrival animation alone is not a fixed-row regression.
Justified dimension snapshots do not define presentation lifetime: width,
visibility, navigation and fragment ownership need explicit contracts if selected.

Every next investigation must name the unanswered question and why existing
evidence cannot answer it. Match **achieved demand and runway**, not copied px/s;
viewport, packing, DPR and media remain independent. Keep setup cost explicit.
Loaded, decoded and painted are distinct. Sources/centre anchors and same-element
counters cannot certify all-visible stability or detect every wholesale replacement.
Account for applied input and arrival animation instead of widening tolerances.

Revision-4 capture already supplies atomic stop clocks, request windows, exposure,
wall episodes, geometry, censoring and costs. Use it before adding probes. Before-send
time is not pure queue time; unrelated maxima are not additive. Perceived store-ready
or older loaded-only endpoints are not action-owned decode. Raw per-run histories
are not universally available; do not invent distributions or joint censor reasons.

Separate photo/cache/transport attribution from synthetic controls. Selected changes
must preserve current-image success, short stops, reversal, capacity, resize/density,
seek/history and non-wheel demand. Required full product gates, independent review
and explicit adverse-result disposition cannot be replaced by measurement controls,
retries, timeout inflation or weakened assertions.

Campaigns/dry runs remain operator-run; live work needs fresh scoped permission.
Do not alter shared servers, proxy behavior or non-local data. Persist only sanitized
evidence, never identities, signed URLs or credentials. Reuse existing controls and
keep runtime practical; a new experiment must answer a new decision, not re-prove
that the core browsing workflow exists.
