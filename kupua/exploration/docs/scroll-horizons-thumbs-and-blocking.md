# Scroll horizons: thumbnails and buffer-edge blocking

Current decisions and remaining work, updated 19 October 2026. This document owns **B2:
backward data prediction** and **F2: final-image delivery**. It preserves conclusions needed
for those decisions, not an execution history. Implementation mechanics belong in the
[scroll guide](00%20Architecture%20and%20philosophy/03-scroll-architecture.md) and
[component reference](00%20Architecture%20and%20philosophy/component-detail.md); completed code
changes belong in the [changelog](changelog.md). Packing research is in the
[archived Justified plan](zz%20Archive/justified-density-prototype-plan.md), not an active mandate.

## Current decision

Grid and Justified now eagerly load the visible virtualizer rows **plus two mounted rows
below**. Rows above and remaining overscan stay browser-managed lazy. The band is spatial,
including during upward scrolling. Five-row overscan, no-range lazy fallback, thumbnail-only
context updates, image sources, decoding, packing and data-window policy are unchanged.
Functional validation and independent cold reviews are complete; initial operator feedback
is positive. The completed four-repetition `2 eager thumbnail rows at bottom` campaign supports
retaining this policy: constrained-scroll blank area fell from 13.66% to 0.14% in Grid and
36.63% to 2.95% in Justified. **The lower-band decision is settled**, not awaiting another
policy experiment; B2/F2 address the remaining problems without reopening it by default.
This is a readiness improvement, not universal acceleration: Grid reversal frame p95 rose
50.2 -> 53.9 ms, and some navigation timings worsened. See the [campaign assessment](#post-lookahead-campaign).

Preserve the earlier fixes: viewport-valid velocity sampling, stale-start backward-admission
protection (B1), and thumbnail-only loading updates (F1). They remove accidental work without
solving either remaining problem. True-result-end clipping (F3) is accepted and closed.

| Open work | Remaining problem | What the two-row work establishes |
| --- | --- | --- |
| **B2** | In seek mode, the physical scrollable window ends at loaded data; late publication can stop backward movement. | Earlier thumbnail admission cannot extend that window. Reversal results still depend on data delivery and achieved travel. |
| **F2** | Current visible/final images can arrive late during sustained browsing, reversals or rapid traversal. | Two lower rows improve Grid and early Justified readiness, but do not cure late Justified exposure or establish delivery priority. |

Neither item is implemented by the two-row change. Further product changes need their own
selected scope. No upper band, async hint, scheduler, packing reset, larger buffer or permanent
policy-comparison flag is selected. Extra bytes are acceptable when they improve UX; frame
cost, competition with current demand, bounded resources and position preservation still matter.

## B2. Choose and validate a backward-prediction budget

**Decision:** is an occasional additional 200-image page after a short stop acceptable in
exchange for less blocking during sustained backward browsing? Optimize smoothness, not zero
unused prefetch. Distinguish valid speculation from maintenance-driven reads and compare cost
per achieved movement. Agree the bounded comparison's speculative-page/concurrency envelope
before implementation; do not turn byte minimization into the objective.

The studied candidate mirrors the existing **400 ms forward horizon backward**, capped at
200 images. B1 subsequently removed a stale-start admission path, so the old candidate's read
counts are not its final post-B1 cost. Do not repeat the whole experiment matrix or add
latency learning at the same time.

### Evidence to reuse

Matched actual-renderer controls used 70,000 synthetic results, 201-image starting buffers,
4,000 px/s sustained/reversal input and reversed treatment order. Initial headroom was 90
images in Grid and 81 in Justified. Read delay was 350/900 ms for sustained/reversal cases
and 100 ms for a 600 px short stop.

| Control | Existing policy -> backward-lookahead candidate | Useful conclusion |
| --- | --- | --- |
| 600 px short stop, both layouts | No blocking in either; 0 -> 1 read | One speculative 200-image page, without the old refill chain. |
| Grid sustained/reversal, 900 ms delay | About 247-277 -> 0 ms blocking; nominal reads 1 -> 2 | Earlier admission can remove this bounded stall, with greater achieved travel. |
| Justified sustained/reversal, 900 ms delay | About 1,053-1,056 -> 376-383 ms blocking; typically 2 -> 3 reads | Useful reduction, but a substantial physical wall remains. |
| 350 ms delay | Little or no blocking in either policy | Little latency benefit available from extra prediction in these conditions. |

The study reached only **801 buffered images**, not full-capacity eviction. Every candidate
journey had an unexposed final page: Grid's last read followed stale base-threshold geometry
addressed by B1; Justified's used valid predictive demand. Instrumentation and maintenance
interleavings affected timings; these are not pooled effect sizes or byte-saving estimates.
A blanket 150-image floor previously caused three reads/600 hits after a short stop without
avoiding a stall. Do not resurrect that indiscriminate floor.

The later two-row thumbnail D9 screening did **not** change refill policy. One Grid candidate
journey nevertheless admitted two backward reads versus one while travelling farther. Every
stopped viewport decoded, with no post-stop refill starts or pending refills. This reinforces
the need to compare achieved movement and data demand, not infer a refill-policy regression
from raw counts or mistake successful stopped media for a solved moving buffer wall.

The full post-lookahead campaign reinforces B2: Justified D9 median blocking rose
217 -> 385 ms with about 4% less driven travel, although the worst repetition improved
707 -> 624 ms. Both layouts still admitted two backward reads, with no post-stop starts or
pending refills. The physical wall remains; this does not isolate a thumbnail-caused regression.

### Remaining validation

1. Hold B1 and the implemented two-row thumbnail policy fixed. Recheck affected short-stop,
   sustained-motion and reversal cases with matched initial identities, complete buffer,
   offset, visible range, viewport and headroom.
2. Add the missing **capacity-bound prepend/eviction** case. Reach actual retention limits,
   allowing Grid column alignment, and verify compensation through continued motion/reversal.
3. Retain indexed/fixed-layout and legitimate unmarked/programmatic-demand controls. Missing
   velocity eligibility or `userInitiated=false` is not a blanket admission veto.
4. Decide from blocking, achieved travel, unexposed pages, post-stop starts, concurrency,
   retention and position. Revise the policy if cost exceeds the agreed envelope.

Reuse the [density driver](../../e2e-perf/density-browser.ts) and
[app-fixture home](../../e2e-perf/density-app-fixtures.spec.ts), including D9's bounds, refill
and stopped-recovery probes; extend these for the missing capacity case rather than build
another harness. Temporary candidate fixtures were removed. A separate accepted-refill-latency
horizon is worth considering only if the simpler policy is useful and latency remains limiting.
Reserve is approximately consumption
rate times admission-to-publication latency. A 400 ms horizon cannot hide 900 ms delivery
indefinitely or increase sustained throughput; adapter `fetchDuration` is not the whole delay.

## F2. Protect final-image delivery without inventing a scheduler

**Question:** what still delays current visible/final images after sustained motion, stopping,
reversing or rapid traversal: admission, queued delivery, transfer, decoding or publication into
the current element? The two-row change addresses ordinary forward admission, not all of F2.

### Relevant evidence

- **Late Justified remains unresolved without a buffer wall.** D10 screening achieved matched
  travel and zero blocking, yet the lower band did not improve late-phase exposure. Investigate
  the remaining arrival/delivery work, not automatically wider buffers or more eager rows.
  In the full campaign, late exposure improved only 3.24% -> 2.77%, while the longest-visible-wait
  median rose 166 -> 187 ms. Element/source changes shifted into the late phase alongside a
  media-concurrency peak of 58: a maintenance/arrival lead, not proven eviction causality.
- **Runtime arrival can cost frames.** Predecoded-media controls removed the earlier frame
  penalty; hiding already-warm images did not consistently help further. This narrows the cause
  to arrival/decode/first display, not a proven browser subsystem. Warming all 200 images was
  an attribution control, not a proposed policy. An async hint showed no repeatable benefit.
- **Search under media load is a real guardrail.** D11 supported overlap and measured slower
  refreshes, but does not isolate pure media causality or certify different-query/seek priority.
  Keep transport completion, data publication and visible readiness separate.
- **Final traversal is a separate path.** P14d final images all landed, with a 408 ms median
  after F1, 377 ms in the unchanged-policy baseline and 476 ms after lookahead (near the earlier
  B1 + T1 result of 480 ms). Its response-completion clock is
  relative to destination commit, not pure request duration. List-thumbnail findings do not
  diagnose full-image traversal, and intermediate images at an 80 ms cadence need not all load.

### One row above: an open comparison, not a rejected design

The lower band was selected for an observed forward-entry problem and supported by direct
0/1/2/3-lower-row comparisons. **Those experiments did not test a one-row upper band.** D9
tested reversals under the lower policies; it is not evidence that upper preparation is useless.

A short reversal may revisit already-requested or decoded images, so an upper band can add
little in that case. That is a mechanism to check, not a cache guarantee: sustained backward
browsing into unseen rows, after eviction or from an arbitrary starting position is different.
There is no established reason that two below/one above would be intrinsically wrong.

If backward thumbnail popping remains an unmet need, compare **two below versus two below
plus one above**, holding B2/data policy fixed. Include both cached reversal and genuinely
unseen backward entry; observe decoded lead, visible waits, final readiness, frames and refresh
contention. Bytes alone should not veto a useful improvement. The additional arrival/decode
work still needs to earn its cost; do not introduce direction tracking or a scheduler merely
to test this bounded alternative. Upper thumbnail preparation is not B2's metadata prediction.

### Next discriminating work

1. Use the [completed campaign assessment](#post-lookahead-campaign) to select
  one residual UX problem, rather than reopening the completed matrix or combining late
   Justified, backward entry and rapid traversal into one diagnosis.
2. Establish current-element/source readiness and action-owned timing. Match identities,
   metadata/layout, viewport/screen/DPR, asset quality, cache and transport conditions. Reuse
   D9-D11 or P14d's 20-step/80 ms traversal contract as appropriate.
3. Add only missing attribution from M1 below. If contention is demonstrated, hold obsolete
   speculative media, move/reverse to a new visible destination and compare bounded changes
   that protect current demand and reject late replacement writes.
4. Adopt a change only when final readiness improves at an acceptable cost without thrashing,
   lost demand, preservation regressions or unaccepted frame/search regressions.

Reuse the [visible-wait probe](../../e2e-perf/thumbnail-probe.mjs),
[request-cohort probe](../../e2e-perf/network-probe.mjs), D10/D11 drivers and their existing
offline/browser/app fixtures. Add only the missing event-level association needed by the
selected F2 question; preserve current-element checks, censoring and historical contracts.

Visible-first is a **priority goal**, not a strict completion order. A cheap cached offscreen
image finishing first is not itself harmful. Do not withhold ready images, reorder the DOM to
enforce centre-out completion or delay needed images at rest merely to avoid speculation.
Preserve useful completed cache entries. Separate origins do not eliminate competition for
bandwidth or main-thread work.

The earlier actual-renderer control illustrates the distinction: eager visible Grid admission
improved 18/24 decoded to 24/24 but added 12 requests, six outside the final viewport. Those six
completed bodies were 117,036 bytes in a synthetic fixture, not a live traffic estimate.
Separate-origin HTTP/1 delivery still took about three seconds. Admission repair is not delivery
priority, a general CDN-defect diagnosis or justification for a laptop-proxy-only optimization.

## Thumbnail lookahead findings

Complete numeric records, including adverse and excluded attempts, remain in
[lookahead evidence](scroll-horizons-thumb-lookahead-results.json). Keep them separate from
canonical [density](../../e2e-perf/results/density-log.json),
[rendering](../../e2e-perf/results/audit-log.json) and
[perceived](../../e2e-perf/results/perceived-log.json) histories. Historical "current" policy
means visible-only eager admission, **not** today's two-row implementation.

The D10/D9 and strictly matched D11 comparisons used Chromium 151.0.7922.34 at 1720x960/DPR2.
D10/D9 had two observations per policy/case; D11 had four matched blocks per policy. Their
numeric records retain matching, order and transport conditions; they are not interchangeable
with the smaller embedded-browser matrix or the canonical D11 campaign.

| Finding | Decision-relevant evidence | Limit |
| --- | --- | --- |
| Two lower rows were sufficient for ordinary entry | In the initial 64-traversal matched matrix, +2 had zero loading-at-entry events in all four Grid/Justified profiles. +1 still missed some faster entries; +3 showed no established advantage. | Entry events are not whole-viewport exposure or instantaneous paint. The corpus mostly covered ordinary landscape/portrait images. |
| Additional transfer was modest, not free | Median paired extra cost per short journey was 12 requests/168 kB in Grid and 10/122 kB in Justified, including setup/recovery. | Bytes do not measure decoded memory, frame work or contention; unexposed in a short journey is not permanently wasted. |
| An adverse frame result was real in its conditions | Embedded Chromium 150, 1163x887/DPR2: faster Justified +2 raised p95 from roughly 9-17 to 25-33 ms; observer-disabled controls retained the penalty. Predecoded visible media brought both policies near 9.3 ms. | The exact subsystem was not isolated. Browser-cache bypass does not guarantee cold proxy/CDN caches. |
| No case for an async hint | Ordinary Chromium 151, 1720x960/DPR2: current, +2/default and +2/async all had p95 around 15-17 ms; both lookahead arms improved readiness. | No repeatable async advantage. Browser, viewport and media changed together, so this does not refute the earlier penalty or prove a browser-upgrade fix. |
| Sustained benefit is uneven | Matched D10 screening: Grid blank area 1.44-2.07% -> 0-0.070%; Justified early 0.30-0.42% -> 0.024-0.035%, middle 0.88-1.32% -> 0-0.70%, late 1.94-2.10% -> 2.21-2.43%. | Two samples per policy/case, not population tails. Each phase travelled 9,560-9,610 px with no blocking. Late Justified was not cured. |
| Reversal has a frame trade-off | Grid p95 47.9 -> 50.8 ms and 47.5 -> 49.9 ms with +2, alongside 320/167 px more travel. Justified exposure/blocking was mixed. Every stopped viewport decoded. | Different final populations and delivery times prevent same-image speed claims. A large Justified exposure win had much slower control delivery. |
| Refresh remains worth watching | Strictly matched D11: +2 active-media readiness improved in three blocks but was 158 ms slower in one. Drained readiness was slower by a within-block median of about 62 ms. Image starts rose 73 -> 88; pending at visible completion roughly 27 -> 41-43. | Publication varied too; causality is unresolved. Completed bytes exclude pending transfers. No universal search-safety or contention claim. |

### Post-lookahead campaign

`2 eager thumbnail rows at bottom`, 19 October: four repetitions across all suites, matching
the preceding baseline's recorded environment and scenario contracts. Source fingerprint
`2937abf4005ab6bc`; density entry `2026-10-19T01:50:04.302Z`. Capture checks passed and final
media/refresh comparisons were uncensored. Different content/packing and uncontrolled upstream
caches prevent a randomized causal comparison; four-sample p95 is the worst repetition.

- **Readiness gain:** constrained Justified worst blank area fell 75.22% -> 4.34%; median
  decoded lead moved -517 -> +29 px at comparable driven distance. D10 Grid exposure stayed
  near zero throughout; Justified early/middle fell 1.27/2.34% -> 0.03/0.04%. Late Justified
  and reversal trade-offs remain as described under B2/F2.
- **Refresh:** Justified's within-repetition active-minus-drained media penalty fell
  373 -> 27 ms; active readiness improved 2.90 -> 2.62 seconds. Dispatch pending media also
  fell 18 -> 9, while pending at visible completion rose about 27 -> 46. Grid's paired penalty
  rose 13 -> 62 ms. Canonical D11's packing limitation still applies; contention is not solved.
- **Broader guardrails:** drag-release seek worsened 1,108 -> 1,630 ms, mostly before store-ready,
  but client-only mid-buffer Grid-to-Table also worsened 275 -> 362 ms. Detail opening improved
  1,000 -> 871 ms, near its after-F1 level. Recorded Back/chip-removal drift stayed zero and
  P17 retained B1's single backward read. Do not attribute all timing shifts to either thumbnails
  or the backend, or interpret a successful campaign as resolving intermittent transport faults.

### Unchanged-policy measurement baseline

The four-repetition `thumbnail measurement baseline - current policy` campaign is the
pre-lookahead reference for the new D10/D11 metrics: density entry `2026-10-18T20:20:32.820Z`,
HEAD `df3287c84`, recorded fingerprint `13fc23e03b09a6e8`, local media-api, Chromium
151.0.7922.34, 1720x960/DPR2, headed/one worker, no CPU throttle, cutoff 15 February 2026.
Keep original fingerprints; a dirty-source fingerprint is not proof of live-served source.
The corpus/upstream caches were not frozen; an operator-owned local DNS mitigation also
limits attribution across older campaigns. Transport diagnosis remains separate work.

- **D10:** Justified early/middle/late pending viewport area 1.27/2.34/3.24%; longest visible
  waits 112/147/166 ms; frame p95 about 17 ms. Peak media concurrency rose 9/9.5/46.5, but late
  end-pending median was 0.5, maximum 2. This supports transient arrival pressure, not an
  indefinitely growing queue. Media mix, delivery/cache and maintenance remain possible causes.
- **D11:** four supported pairs per layout. Within-repetition active-minus-drained median
  data/placement/decoded-media penalties were Grid +51/+55/+13 ms and Justified +337/+357/+373 ms.
  These shared-start clocks must not be added, and differences of campaign medians are not
  paired effects. Canonical D11's geometry limitation below still applies.
- **Earlier `after F1`:** P17 retained one backward read/prepend versus two before B1;
  Justified steady-scroll p95 returned near 17 ms, but D9 blocking median/slowest remained
  284/643 ms and constrained D8 blank area 57.60%. Preserve the admission/rendering fixes
  without mistaking them for a solved buffer wall or delivery problem.

Other historical Home/search/detail and client-only scrolling/fullscreen-return timing shifts
remain unattributed in the perceived history. There is no B1 + T1 perceived campaign to isolate
F1, and older PP3/PP4/PP8 contracts differ. Do not manufacture a missing baseline by replaying
old checkouts or assign every slower observation to network work.

### Measurement lessons from the experiments

- **Match packing, not just anchors.** Justified retains packing origin/boundary dimensions
  across density unmounts. Equal query, ordered records and anchor placement did not guarantee
  equal visible populations/geometry. The strict D11 comparison normalized packing only while
  unmounted and checked full identities/window/geometry/headroom. That was an experimental
  control, not a product fix. Canonical D11 remains unchanged; permanent normalization needs
  explicit workload versioning and fixtures, not silent mixing of histories.
- **Respect collector lifetimes.** The async-hint experiment's request collector crossed
  fresh-document navigations without valid termination accounting. Its queue/concurrency/byte
  conclusions are excluded, not evidence of a product queue leak. Frame/viewport observations
  remain usable. Recreate collectors per document or validate navigation accounting. This
  does not establish a defect in D10/D11's same-document capture.
- **Verify the actual admission owner.** Use virtualizer range/items and DOM loading attributes,
  with independent row geometry/identity. A geometric count below the viewport alone is not
  the policy oracle. Preserve retained-node/source/decode checks and zero metadata-cell work.
- **Keep incomplete runs separate.** Excluded partial attempts remain in the evidence JSON;
  unknown source/setup failures are not diagnosed causes or samples to pool into accepted runs.
- **Normalize achieved work.** P2 commands 50 px per animation frame, so more frames mean more
  input. D1/D2/D8/D10 use fixed-speed input; D9 uses 3 s backward then 1.5 s forward at 4,000 px/s.
  Do not compare their frame distributions as equal work or credit timing shifts also seen in
  later control arms to lookahead.

Density is a demand multiplier, not another admission fix. The operator's 50-page observation
reached image 515 in Grid versus 1,245 in Justified; a bounded browser sample measured 1.65-1.75x
consumption and about 97% image-slot coverage versus Grid's 60%. Those are content-dependent.
A separately chosen 190 -> 220 px Justified target would imply roughly 25% fewer images per
screen by inverse-square scaling, not 25% less latency/exposure. Keep sizing a visual/UX choice,
not a prerequisite to B2/F2 or permission to change the 130 px narrow-layout target.

## M1. Use existing measurements before adding instrumentation

The durable harness already provides generation-scoped visible waits, bounded CDP request
cohorts, D9 stopped data/media recovery, D10 phase-resolved endurance and D11 same-query
refresh/media-overlap metrics, with fixtures, validators and dashboard support. D9-D11 run
in normal density/combined/full campaigns without extra operator flags. Contracts belong in
the [performance handbook](../../e2e-perf/README.md#visible-waits-and-request-cohorts), not a
new eager-row campaign matrix.

| Existing boundary | Consequence for B2/F2 |
| --- | --- |
| D9 observes movement and stopped data/media readiness with a shared ten-second recovery deadline. Current readiness does not wait for unrelated speculative refills. | Clamped commanded time is not native-wheel latency or frame jank. True ends are not temporary-buffer stalls. Changed destination, timeout or unavailable media must not look like instant success. |
| Completed waits, censored intervals, pending requests and unavailable bytes are distinct. | Censored waits are lower bounds; missing data is not zero. Four-sample p95 is the slowest sample, not a population tail. |
| Legacy Resource Timing `networkBytes` covers completed API/direct-ES traffic only. CDP media means browser HTTP Image requests. | Do not sum incompatible byte definitions or infer backend savings from cancellation. Thumbnail/full-image and visible/speculative/obsolete association is not yet established. |
| Perceived `readStoreTiming` is a latest-store snapshot, not action-owned. JA2 can retain JA1 timing; JB4 can retain JB3; JB2 can read the other arm. | Do not subtract these as network/position-preservation cost. Capture timing within the selected action when attribution is needed. |
| JA2's "decoded" label currently means loaded/nonzero-sized media with matching identity and stable geometry, without explicit `image.decode()`. | Do not equate it with the stricter thumbnail observer. Tightening this boundary is separately selected, versioned measurement work. |
| Perceived scenarios cover Grid/Table and detail/fullscreen, not Justified-specific endurance; JB5 measures return, not intermediate-image arrival. | Producer acknowledgement and list settlement are not necessarily visible feedback or all-thumbnail decode, and do not close F2. |

Add finer request association only when it distinguishes competing causes in the selected
case. Keep association keys browser-local; save sanitized numeric aggregates, never identities,
signed URLs or raw responses. A useful separate improvement is preserving per-run numeric
records: density JSONL is deleted after aggregation and perceived temporary files retain only
the last repetition. Current histories cannot reconstruct every distribution or paired-control
difference. Preserve history/failure-transaction guarantees; never invent missing samples or
make this improvement a universal prerequisite.

## Contracts and owners

| Owner | Contract to preserve |
| --- | --- |
| [Data window](../../src/hooks/useDataWindow.ts), [tuning](../../src/constants/tuning.ts) | Forward admission `min(200, 50 + max(0, velocity) * 400 ms)`; backward threshold 50. EMA alpha 0.4, idle reset 250 ms. Velocity eligibility resets across publication/layout/owner discontinuities. |
| [Scroll effects](../../src/hooks/useScrollEffects.ts) | Visible-range reporting, first-row backward validity, compensation and separate 500 px near-bottom forward fallback. Navigation intent is not geometry validity. |
| [Search store](../../src/stores/search-store.ts) | 200-image pages, 1,000-image retention cap, one extension in flight per direction. Post-seek cooldown 100 ms, deferred scroll 150 ms, post-prepend cooldown 50 ms. Publication does not wait for thumbnails. |
| [API datasource](../../src/dal/api-data-source.ts), [adapter](../../src/dal/grid-api-search-adapter.ts) | Cursor reads, fetching, parsing and mapping precede publication. No accepted-refill-latency feedback in the predictor. |
| [ImageGrid](../../src/components/ImageGrid.tsx), [layout constants](../../src/constants/layout.ts) | Five overscan rows; visible plus two lower rows eager, upper/rest lazy. Only the thumbnail consumes loading context. Grid row 303 px, thumbnail slot 190 px. |
| [Justified geometry](../../src/lib/windowed-justified-layout.ts) | Target 190 px, 130 px below 600 px width; spacing 4 px; 48-image technical blocks. Packing boundaries are not fetch barriers. |
| [Image URLs](../../src/lib/image-urls.ts), [traversal](../../src/hooks/useImageTraversal.ts), [prefetch](../../src/lib/image-prefetch.ts) | Thumbnail quality unchanged; full-image traversal has separate cadence/priority/cancellation behavior. No shared scheduler selected. |

Default result regimes are resident through 1,000, indexed through 65,000, then seek. Indexed
mode can expose missing-data placeholders rather than a physical wall. Preserve generation,
publication/cancellation guards, bounded retention and compensation. Forward/backward reads
may coexist under their per-direction limits. Keep one geometry/scroll owner.

Improvements must transfer to hosted APIs and canonical CloudFront/S3 media while retaining
local proxy modes. The [TEST deployment plan](kupua-TEST-deployment-plan.md) owns hosting.
Do not change URLs, quality/formats, DPR selection, sizing, buffer/page limits or the Justified
licensing gate as incidental optimization.

## Lessons that prevent repeating work

- **Input intent is not viewport validity.** Maintenance can move offsets/ranges without new
  browsing. Valid scrollbar/programmatic demand matters; wheel/touch/key provenance alone
  must not govern either prediction or base admission.
- **Admission precedes priority.** Visible slots with unrequested/zero-size images were fixed
  by eager admission, not higher priority. Initial-markup toy fixtures missed virtualization
  lifetimes; test the actual renderer for lifecycle-dependent hypotheses.
- **A URL is not an element lifetime.** Resource Timing can describe an earlier element.
  Revalidate region, element, identity and source after asynchronous decode. Calling `decode()`
  on incomplete lazy media can start work, so it is not passive admission diagnosis. A failed
  decode is not an unissued request. Fixture callback data must also outlive pending callbacks.
- **Keep cheap updates out of expensive consumers.** Thumbnail-only context avoids crossing
  the full metadata-cell memo boundary on loading transitions. Development invocation counts
  are not commits; use disabled-observer controls when instrumentation might affect timing.
- **Measure geometry independently of animation.** Arrival CSS translates cells from -8 px
  over 0.8 s. Use row position/translation-adjusted movement and capture anchors before releasing
  held responses; do not weaken placement tolerance to accommodate raw animated bounds.
- **Do not transplant upstream architecture.** The pinned
  [Immich web study](https://github.com/immich-app/immich/commit/53618ff7496ee313d1cff7b3bcdf19c82b765cdf)
  found a month-index/placeholder model and same-origin URL-keyed worker, not a ready-made
  arbitrary-sort cursor-window or CDN/current-demand scheduler. Useful principles are
  deduplication, protecting current demand and rejecting late writes. The installed WASM
  package supplies geometry only; static web-code research is not runtime/native certification.
  Pinned source: [manager][im-manager], [layout][im-layout], [worker][im-worker],
  [preloader][im-preload] and [loader][im-loader].
- **Browser upgrades are not diagnosed fixes.** Embedded and Playwright browsers are separate
  runtimes. Comparisons must preserve viewport/screen/DPR and asset size; full-image prefetch
  uses `window.screen`. Do not repeat the completed version study without a new question.

P8/Table, the old P8/D3 detour and bootstrap/DNS investigation remain parked. Broader scheduling,
workers/caches, placeholder runway, scaled coordinates or larger buffers require a demonstrated
need and explicit selection, not automatic expansion of B2/F2.

## Measurement and validation

Use the [handbook](../../e2e-perf/README.md), [browser playbook](embedded-browser-playbook.md)
and [safeguards](infra-safeguards.md). Campaigns and dry runs remain **operator-run**; old runtime
or permission notes are not current authority. Offline/parser checks use `test:perf-harness`,
synthetic browser checks `test:perf-fixtures`, and actual-app fixtures use runner-owned port
3041 with in-memory data and blocked service traffic.

For a selected B2/F2 change:

1. Name the unanswered question, why existing evidence cannot answer it and the smallest
   discriminating control. Match content/window/headroom/input/media conditions, reverse
   treatment order and bound time, reads and retained observation state.
2. Measure motion (blocking, travel, exposure, frames), final readiness (current stable
   destination, data and decoded media) and cost (accepted reads, pending/obsolete work,
   available bytes, concurrency and retention). Vetoed attempts are not saved backend reads.
3. Preserve transition-specific identity/placement, reversal/history, focus/selection and
   capacity-bound maintenance. Synthetic scrolling does not certify native trackpad inertia.
4. Use failing-first regressions and existing helpers; identify obsolete assertions explicitly,
   run required full validation and obtain independent review. Follow prescribed root npm
   commands and port coordination; never poll, rerun or interfere with an active suite.
5. Compare compatible campaign contracts and provenance after the change stabilizes. Do not
   replay complete earlier studies for reassurance, rewrite fingerprints, fill missing values
   with zero or add a permanent policy matrix for a temporary comparison.

Keep this document a current decision aid. Detailed measurements stay in their existing
histories/evidence record; implementation history stays in the changelog.

[im-manager]: https://github.com/immich-app/immich/blob/53618ff7496ee313d1cff7b3bcdf19c82b765cdf/web/src/lib/managers/timeline-manager/timeline-manager.svelte.ts#L245
[im-layout]: https://github.com/immich-app/immich/blob/53618ff7496ee313d1cff7b3bcdf19c82b765cdf/web/src/lib/managers/timeline-manager/internal/layout-support.svelte.ts#L5
[im-worker]: https://github.com/immich-app/immich/blob/53618ff7496ee313d1cff7b3bcdf19c82b765cdf/web/src/service-worker/request.ts#L12
[im-preload]: https://github.com/immich-app/immich/blob/53618ff7496ee313d1cff7b3bcdf19c82b765cdf/web/src/lib/components/asset-viewer/PreloadManager.svelte.ts#L12
[im-loader]: https://github.com/immich-app/immich/blob/53618ff7496ee313d1cff7b3bcdf19c82b765cdf/web/src/lib/utils/adaptive-image-loader.svelte.ts#L82