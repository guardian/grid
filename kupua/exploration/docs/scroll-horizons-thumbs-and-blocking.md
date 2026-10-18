# Scroll horizons: thumbnails and buffer-edge blocking

Current research and work plan, updated 18 October 2026. This document owns the remaining
buffer-blocking and image-delivery questions. The [Justified plan](justified-density-prototype-plan.md)
owns packing, density preservation and its separate refactor work. Implementation details belong
in the [scroll guide](00%20Architecture%20and%20philosophy/03-scroll-architecture.md) and
[component reference](00%20Architecture%20and%20philosophy/component-detail.md); completed changes
belong in the [changelog](changelog.md). Full measurements remain in the campaign histories.

## Current decision

Keep the committed baseline: viewport-valid velocity sampling (`0a0313d79`), stale-start
backward-admission protection (`a566d452c`), and visible-thumbnail admission with thumbnail-only
loading updates (`325e44dcb`). Their functional validation and combined/perceived campaigns are
complete. Do not repeat that attribution or validation merely because a new session starts.

Two problems remain independent:

| Problem | What is established | Next decision |
| --- | --- | --- |
| Physical buffer wall | In seek mode, the scrollable extent ends at loaded data. Late publication still stops movement, particularly in Justified. Removing accidental refills did not solve this. | B2: decide the acceptable prediction cost, then validate backward lookahead with the corrected admission path. |
| Late images | Visible-thumbnail admission now works. Constrained imagery and rapid final-image landing still show delivery delays; their cause is not yet isolated. | F2: separate current-demand admission, delivery and readiness on matched media; add only the M1 evidence needed for that decision. |

**Recommended next task: B2.** Blocking remains the first investigation priority. F2 can be
selected independently; it is not a prerequisite for B2. Neither this plan nor an earlier
experiment authorises a new product policy, live probe or campaign automatically.

The earlier P6/F3 position concern is closed: the operator confirmed acceptable clipping at
the true result end. It is not a positional bug or a new reproduction gate.

## Next steps

### B2. Choose and validate a backward-prediction budget

**Decision needed before implementation:** is an occasional additional 200-image page after
a short stop acceptable in exchange for less blocking during sustained backward browsing?
Unused prefetch is not automatically a defect. Separate valid speculation from accidental
maintenance-driven reads, and judge cost per achieved movement rather than requiring zero waste.

The candidate already studied mirrors the existing 400 ms forward horizon backward, with a
200-image admission cap. Do not repeat its whole experiment matrix or add latency learning at
the same time. B1 has since removed a stale-start admission path, so old read counts are not
the final candidate's post-B1 budget.

1. Confirm the operator's acceptable extra-page budget and the bounded experiment scope.
2. Recheck the affected short-stop, sustained-motion and reversal cases with B1 held fixed.
   Match initial identities, complete buffer, offset, visible range, viewport and headroom.
3. Add the missing capacity-bound prepend/eviction case. Reach actual retention limits, allowing
   the existing Grid column alignment, and verify compensation while motion continues/reverses.
4. Retain indexed/fixed-layout and legitimate unmarked/programmatic-demand controls. Do not
   turn missing velocity eligibility or `userInitiated=false` into a blanket admission veto.
5. Decide from blocking, achieved travel, unexposed pages, post-stop starts, concurrency,
   retained data and position. If the cost exceeds the agreed budget, stop and revise the policy.

**Existing evidence to reuse:** the repaired-sampler study used matched actual-renderer controls,
70,000 synthetic results, 201-image starting buffers and 4,000 px/s motion. Sustained/reversal
cases added 350/900 ms read delay; the 600 px short-stop control added 100 ms. Initial visible
headroom was 90 images in Grid and 81 in Justified. Treatment order was reversed.
Temporary candidate fixtures were removed; reuse the
[existing driver and observers](../../e2e-perf/density-browser.ts) and
[app-fixture home](../../e2e-perf/density-app-fixtures.spec.ts), not an assumed retained experiment.

| Control | Current -> backward-lookahead candidate | Consequence |
| --- | --- | --- |
| 600 px short stop, both layouts | No blocking in either; 0 -> 1 read | One speculative 200-image page, without the old refill chain. |
| Grid sustained/reversal, 900 ms delay | About 247-277 -> 0 ms blocking | Greater achieved travel; nominal reads 1 -> 2. |
| Justified sustained/reversal, 900 ms delay | About 1,053-1,056 -> 376-383 ms blocking | Greater travel, but a substantial wall remains; typically 2 -> 3 reads. |
| 350 ms delay | Little or no blocking in either policy | Little latency benefit available to justify extra speculation. |

The study reached only 801 buffered images, not full-capacity eviction. Usefulness tracing
found an unexposed final page in every candidate journey. Grid's last read followed stale
base-threshold geometry, now addressed by B1; Justified's last read used valid predictive demand.
These are different costs. The original timings were perturbed by follow-up instrumentation
and maintenance interleavings; do not pool them into a promised effect size or infer byte savings.

A blanket 150-image floor previously caused three reads/600 hits after a short stop without
avoiding a stall. That pre-repair result is a reason not to resurrect an indiscriminate floor,
not proof that every post-repair predictor is wasteful.

Only consider a separate accepted-refill-latency horizon if the simpler policy is worth its
cost and latency remains limiting. Reserve is roughly consumption rate times admission-to-
publication latency. A 400 ms horizon cannot hide 900 ms delivery indefinitely; earlier requests
can absorb bursts, not increase sustained throughput. Adapter `fetchDuration` alone is not that
whole latency.

### F2. Protect final-image delivery without inventing a scheduler

**Question:** when the user stops or reverses, what delays the final visible images: admission,
queued delivery, transfer, decoding, or publication into the current element?

Reuse the existing P14d 20-step/80 ms traversal contract and relevant constrained-density
controls. Match final image identities, metadata/layout, viewport/screen/DPR, asset quality,
cache and transport conditions. List thumbnails and full-image traversal are separate paths;
a result from one is not a diagnosis of the other.

1. Establish current-element/source readiness and action-owned timing for the chosen case.
2. Use M1 only where existing collectors cannot distinguish the competing causes.
3. If contention is demonstrated, hold obsolete speculative media, reverse to a new visible
   destination and compare bounded interventions that protect current demand and reject late writes.
4. Select a product change only if it improves final readiness at an acceptable request/byte
   cost without thrashing, lost demand, preservation regressions or worse frame timing.

All recorded P14d final images landed. Do not require every intermediate image at an 80 ms
cadence to load, or treat a missed intermediate as a permanent image failure. Preserve useful
completed cache entries. An at-rest delay is not the default fix: delaying needed images merely
to avoid all speculative work defeats the admission repair.

The earlier actual-renderer admission control is a useful cost warning: eager visible Grid
images changed 18/24 decoded to 24/24, but added 12 requests, six outside the final viewport.
Those six completed obsolete bodies totalled 117,036 bytes in that synthetic fixture, **not a
live traffic estimate**. Separate-origin HTTP/1 delivery still took about three seconds after
admission was fixed. This establishes that admission and delivery priority are distinct; it does
not establish a general CDN scheduling defect or justify copying a local-proxy optimisation.

### M1. Add only evidence needed by the selected question

The [network collector](../../e2e-perf/network-probe.mjs) deliberately counts completed API/direct-ES
resources, not thumbnail/full-image/satellite traffic. Zero API bytes during traversal can be
correct. Resource Timing misses pending requests, and zero transfer size can mean caching or
restricted timing access; unavailable totals must not become zero.

For a selected F2 control, extend existing measurement owners with the smallest useful set of:

- Separate API, thumbnail and full-image classes; request starts, completions and failures.
- Peak/end-pending work and current-destination versus obsolete work.
- Available transferred/encoded bytes, their provenance, unknown counts and cache evidence.
- Current element/source generation, so an old request for the same URL is not credited to a
  replacement that has not loaded. Keep association keys and URLs browser-local.

Use a bounded local CDP control if Resource Timing cannot answer the question. Do not sum
incompatible byte definitions or infer saved backend work from browser cancellation. Persist
only validated numeric aggregates/approved enums, never identities, signed URLs or raw responses.
Preserve existing API metric semantics; add/version media fields rather than silently broadening
`networkBytes`. Useful routine measurements should not require permanent extra operator flags.

Two existing interpretation limitations matter when choosing instrumentation:

- Perceived `readStoreTiming` is a latest-store snapshot, not an action-owned measurement.
  JA2 can retain JA1's fetch duration; JB4 can retain JB3's. JB2 reads after both alternating
  arms and can report the control's timing. Do not subtract these fields as a supposed network
  cost. Capture timing in the owning action if that attribution is needed.
- JA2's "decoded" label currently means loaded/nonzero-sized media, matching route identity
  and stable geometry; its observer does not explicitly await `image.decode()`. Tighten the
  label or check only as selected measurement work, and version any changed boundary.

**Separate useful follow-up:** retain sanitized per-run numeric records for future campaigns.
Density JSONL is deleted after aggregation; perceived temporary files retain only the final
repetition. Current histories cannot reconstruct missing distributions or all paired-control
differences. Preserve history/failure-transaction guarantees, and never backfill invented samples.
This improvement is not a prerequisite for every product decision or permission to rerun campaigns.

## Baseline worth preserving

The 18 October `after F1` combined and perceived campaigns used the same application-source
fingerprint: local media-api, Chromium 151, headed/one worker, 1720x960/DPR2, no CPU throttle,
cutoff 15 February 2026, four repetitions per scenario. All invocations completed. The live
corpus and caches were not frozen; matching counts/configuration are not randomized causal A/B.

Complete records and dashboards are the source for exact values, other workloads and provenance:
[density](../../e2e-perf/results/density-log.json),
[rendering](../../e2e-perf/results/audit-log.json),
[perceived](../../e2e-perf/results/perceived-log.json), and the
[performance handbook](../../e2e-perf/README.md#dashboards-and-reports).
Keep their original Git/source fingerprints: measurements preceded the later commits.

| Relevant outcome | Evidence | Consequence for future work |
| --- | --- | --- |
| Rendering repair | P2 travel 12,150 -> 13,375 px versus `B1 + T1`; p95 49 -> 42 ms; severe frames 26 -> 5.8/1,000. Justified steady-scroll p95 returns near 17 ms. | Keep F1. These gains do not imply faster image transfer or every interaction. |
| B1 read cost | P17 remains at one backward read/prepend, roughly 113 kB API traffic, versus two before B1. | Preserve valid-demand handling; do not credit later changes with this saving. |
| Remaining physical wall | D9 Justified blocking median/slowest 284/643 ms, versus 131/589 after B1 + T1 and 350/898 at the velocity-fix reference. Driven travel falls 3.6% against B1 + T1. | B2 remains relevant. Requested speed is constant; do not explain this with P2's faster rAF-driven input. |
| Refill accounting | D9 retains two backward starts, peak concurrency one, no starts after stop and no pending refill at observation end. | Counts do not isolate delivery, publication or geometry effects. |
| Stopped admission | No D9 media-censored runs. All final observed images decoded; Grid readiness median/slowest 59.6/66.4 ms, Justified 37/40.9 ms. | Do not trade away the solved admission behavior. Visible populations differ by layout/run. |
| Constrained imagery | D8 mean pending viewport area: Grid 15.52%, Justified 57.60%; Justified median end-of-motion counts are 30 pending and 30 visible. | Smoother frames have not solved image delivery. Motion-end pending is not a settled failure. |
| Rapid final landing | P14d median 408 ms, versus 480 after B1 + T1 and 241 at the earlier reference; its response-completion clock is about 400 ms. All finals land. | F2 remains open. That clock is relative to destination commit, not pure request duration. |
| Variable tails | Warm Grid blank exposure has a 636 ms slowest run despite a 17 ms median. A local F1 control had one unassigned 399 ms frame/763 ms LoAF sample; bounded follow-ups did not repeat it. | Retain adverse samples; do not label them noise or claim uniformly faster behavior. |

P2 drives 50 px per animation frame for four seconds, then observes two seconds settling.
More delivered frames mean more commanded movement. D1/D2/D8 instead drive 1,200 px/s; D9
drives 3 s backward plus 1.5 s forward at 4,000 px/s. D7 is event-bound maintenance. Do not
compare those frame distributions as equal work. P2 churn per 1,000 achieved pixels was nearly
flat despite higher raw churn after F1; normalise work before inferring a regression.

### Perceived baseline and unresolved signals

The nearest compatible perceived reference is `D9 recovery baseline`, before the velocity,
B1/T1/F1 changes. There is no B1 + T1 perceived campaign, so these deltas cannot isolate F1.
The older density-refactor campaign has different PP3/PP4/PP8 revisions. Do not reconstruct an
old checkout or repeat whole campaigns merely to manufacture a missing baseline.

- Home median settlement rose 1,176 -> 1,474 ms; warm search 1,323 -> 1,506 ms; cold small-result
  navigation 975 -> 1,157 ms. Most additional Home/cold-navigation time appears before store-ready,
  not proof that the server alone caused it. These are follow-up baselines, not attributed bugs.
- Sort/seek-click/deep-Back medians are broadly stable; Back and chip removal report zero anchor
  drift. Drag-release seek has a slower tail (1,505 ms), as does loaded detail readiness (1,320 ms).
  Indexed seek/selection/maintenance tails are mixed; full values remain in the histories.
- Client-only loaded scrolling rose 123 -> 141 ms and fullscreen return 152 -> 171 ms. Do not
  dismiss every slower observation as network work, or turn small changes into broad failure claims.
- JB2 facet timing is order-sensitive: about 1,245 ms when its matched query runs first versus
  2,053 ms when the facet runs first. The earlier campaign has the same pattern. Compare matched
  pairs; differences of aggregate medians are not position-preservation overhead estimates.
- PP10's 2,521 ms is background publication of 21,627 map entries, not a blank-interface wait.
  JB5 times fullscreen exit after traversal, not intermediate-image arrival; it does not close F2.

Perceived scenarios cover Grid/Table and detail/fullscreen, not Justified-specific latency or
endurance. Producer acknowledgement is not visible feedback; most list settlement checks are
not all-thumbnail decode checks. Shared-start clocks must not be added. Four-sample p95 is the
slowest repetition, not a reliable population tail. Null/sparse readiness is not zero latency.

## Contracts and owners

| Owner | Contract relevant to the next work |
| --- | --- |
| [Data window](../../src/hooks/useDataWindow.ts), [tuning](../../src/constants/tuning.ts) | Forward admission `min(200, 50 + max(0, velocity) * 400 ms)`; backward threshold 50. EMA alpha 0.4, idle reset 250 ms. Viewport-valid velocity resets across publication/layout/owner discontinuities. |
| [Scroll effects](../../src/hooks/useScrollEffects.ts) | Visible-range reporting, first-row backward validity, compensation and the separate 500 px near-bottom forward fallback. Navigation intent is not geometry validity. |
| [Search store](../../src/stores/search-store.ts) | 200-image pages, 1,000-image retention cap, one extension in flight per direction. Post-seek cooldown 100 ms, deferred scroll 150 ms, post-prepend cooldown 50 ms. Data publication does not wait for thumbnails. |
| [API datasource](../../src/dal/api-data-source.ts), [adapter](../../src/dal/grid-api-search-adapter.ts) | Cursor reads, fetching, parsing and mapping precede publication. The predictor has no accepted-refill-latency feedback. |
| [ImageGrid](../../src/components/ImageGrid.tsx), [layout constants](../../src/constants/layout.ts) | Five overscan rows; visible thumbnails eager, overscan lazy. Only the thumbnail consumes row-local loading context. Grid rows 303 px, thumbnail slot 190 px. |
| [Justified geometry](../../src/lib/windowed-justified-layout.ts) | Target height 190 px, 130 px below 600 px width; spacing 4 px; 48-image technical blocks. Packing boundaries are not fetch barriers. |
| [Image URLs](../../src/lib/image-urls.ts), [traversal](../../src/hooks/useImageTraversal.ts), [prefetch](../../src/lib/image-prefetch.ts) | Thumbnail assets/quality are unchanged. Full-image traversal has separate cadence/priority/cancellation behavior; no shared scheduler is selected. |

Default result regimes are resident through 1,000, indexed through 65,000, then seek. Indexed
mode can expose missing-data placeholders rather than a physical wall. Preserve existing
generation/publication/cancellation guards, bounded retention and position compensation.
Forward/backward requests may coexist under the per-direction limits.

Improvements must transfer to hosted APIs and canonical CloudFront/S3 media, while retaining
local proxy modes. A laptop-proxy-only result is insufficient. The
[TEST deployment plan](kupua-TEST-deployment-plan.md) owns hosting direction. Do not change URLs,
quality, formats, DPR selection, density sizing, buffer/page limits or the Justified licensing
gate as incidental optimisation. Keep one geometry/scroll owner.

## Lessons that prevent repeating work

- **Input intent is not viewport validity.** Maintenance can move scroll offsets and virtualizer
  ranges without new browsing. Valid scrollbar/programmatic demand still matters; do not gate
  prediction or base admission solely on wheel/touch/key provenance.
- **Admission precedes priority.** The confirmed lazy-image gap involved visible slots with
  zero-size/unrequested imgs. Raising priority did not admit them; visible eager loading did.
  Faster transport cannot repair a request never issued. Toy initial-markup fixtures missed
  the virtualization lifecycle; use the actual renderer for lifecycle-dependent hypotheses.
- **A URL is not an element lifetime.** Old Resource Timing entries can belong to an earlier
  element. Revalidate current region, element, identity and source after asynchronous decode.
  Do not call `decode()` on incomplete lazy images during passive admission diagnosis: it can
  start work. A failed decode must not be confused with an unissued request.
- **Separate cheap updates from expensive consumers.** Loading changes once crossed the full
  metadata cell's memo boundary. Controlled tests isolated that work from DOM attribute changes;
  thumbnail-only context consumption preserves admission without it. React development invocation
  counts are not commits, and counters themselves need disabled-observer controls.
- **Measure geometry independently of animation.** Arrival CSS translates cells from -8 px over
  0.8 s. Use row position and CSS-translation-adjusted cell movement rather than weakening a
  placement tolerance when raw bounds move. Capture anchors before releasing held responses.
- **Do not transplant upstream architecture.** The completed Immich web study at
  [53618ff](https://github.com/immich-app/immich/commit/53618ff7496ee313d1cff7b3bcdf19c82b765cdf)
  found a month-index/placeholder model, not Kupua's arbitrary-sort cursor window. Its inspected
  worker is same-origin and URL-keyed, not a ready-made CDN/current-demand scheduler. Useful
  principles are deduplication, protecting current demand and rejecting late replacement writes.
  See the pinned [manager][im-manager], [layout][im-layout], [worker][im-worker],
  [preloader][im-preload] and [loader][im-loader]. This was static web-code research, not runtime
  performance or native/CDN certification. The installed WASM package supplies geometry only.
- **Browser upgrades are not a diagnosed fix.** Playwright and the embedded browser are separate
  runtimes. A selected upgrade must preserve viewport/screen/DPR and asset-size comparability;
  full-image prefetch uses `window.screen`. Do not repeat the completed version study without a
  new question or treat an upgrade as an established remedy for loading/blocking.

P8/Table, the old P8/D3 detour and bootstrap/DNS investigation remain parked, not prerequisites.
Broader scheduling, workers/caches, placeholder runway, scaled coordinates or larger buffers
are possible future proposals, not selected work. Evidence and explicit approval should decide
whether their complexity is justified; the current steps do not foreclose broader research.

## Measurement and validation

D9 is part of normal density/combined/full campaigns, **without an extra operator flag**.
It measures movement separately from stopped data/media recovery, with a shared ten-second
recovery deadline. Current visible readiness does not wait for unrelated speculative refills.
Clamped commanded time is not native-wheel latency or frame jank; true result ends are not
temporary-buffer stalls. Changed destination, timeout or unavailable media must not look like
instant success. The driver API's optional `measureBounds` argument is enabled internally by D9.

Use the existing [handbook](../../e2e-perf/README.md),
[browser playbook](embedded-browser-playbook.md) and [safeguards](infra-safeguards.md).
Local observer/parser checks are `test:perf-harness`; synthetic browser checks are
`test:perf-fixtures`; actual-app fixtures use runner-owned port 3041, in-memory data and blocked
service traffic. Real campaigns/dry runs remain operator-run. Check current runtime and session
permission before live work; old app/port notes are not authority.

For the next approved change:

1. Name the unanswered question, why existing evidence cannot answer it, and the smallest
   discriminating control. Match content/window/headroom/input/media conditions and reverse
   treatment order. Arm interventions after setup; bound time, reads and retained observation state.
2. Measure motion (blocking, achieved travel, exposure, frames), final readiness (current stable
   destination, data and decoded media), and cost (accepted reads, pending/obsolete work, available
   bytes, concurrency and retention). Do not count vetoed attempts as saved backend requests.
3. Preserve identity/placement within the existing transition-specific rules, reversal/history,
   no unintended focus/selection and capacity-bound maintenance. Synthetic scrolling does not
   certify human trackpad inertia or every painted frame.
4. For a product repair, write a failing regression first, identify affected existing assertions,
   run the relevant full validation and obtain cold review. Reuse existing tests and helpers.
   Run prescribed npm scripts from repo root; do not poll or rerun active tests.
5. Recommend an operator campaign only for a new comparison question after the change stabilises.
   Both current combined and perceived campaigns are already complete; do not rerun them merely
   for reassurance. Keep historical fingerprints and missing values intact.

Update this plan with current decisions and evidence needed by future work, not session logs,
commit recipes or repeated full campaign narratives. Store complete measurements in their
existing histories; keep implementation history in the changelog.

[im-manager]: https://github.com/immich-app/immich/blob/53618ff7496ee313d1cff7b3bcdf19c82b765cdf/web/src/lib/managers/timeline-manager/timeline-manager.svelte.ts#L245
[im-layout]: https://github.com/immich-app/immich/blob/53618ff7496ee313d1cff7b3bcdf19c82b765cdf/web/src/lib/managers/timeline-manager/internal/layout-support.svelte.ts#L5
[im-worker]: https://github.com/immich-app/immich/blob/53618ff7496ee313d1cff7b3bcdf19c82b765cdf/web/src/service-worker/request.ts#L12
[im-preload]: https://github.com/immich-app/immich/blob/53618ff7496ee313d1cff7b3bcdf19c82b765cdf/web/src/lib/components/asset-viewer/PreloadManager.svelte.ts#L12
[im-loader]: https://github.com/immich-app/immich/blob/53618ff7496ee313d1cff7b3bcdf19c82b765cdf/web/src/lib/utils/adaptive-image-loader.svelte.ts#L82