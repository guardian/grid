"use strict";
(() => {
  const entries = Array.isArray(window.__DENSITY_LOG__?.entries) ? window.__DENSITY_LOG__.entries : [];
  const rows = entries.flatMap((entry, campaign) => Object.values(entry.metrics ?? {}).map(record => ({ entry, campaign, record })));
  const $ = id => document.getElementById(id);
  const make = (tag, value, className) => { const el = document.createElement(tag); if (value != null) el.textContent = value; if (className) el.className = className; return el; };
  const names = { grid: "Grid", justified: "Justified", table: "Table" };
  const colors = { grid: "#00adee", justified: "#ffbc01", table: "#cfcfcf" };
  const workload = {
    "scroll-forward": ["D1 · Fresh-data forward journey", "Versioned directional browsing. Revision 4 uses fixed 30/100/200 results/s steps and atomic stopped-image recovery; older profiles remain separate."],
    "scroll-backward": ["D2 · Fresh-data backward journey", "Revision 4 uses the fixed load ladder, a brief reverse leg and atomic recovery. Older constant-rate and repeat-path workloads are not interchangeable."],
    "scroll-cold": ["D1 · Scroll / cache bypass", "New requests bypass browser cache during observation; already-loaded pictures remain loaded."],
    "scroll-warm": ["D2 · Scroll / repeat path", "The same path is traversed after priming. This is not a guarantee that every picture is cached."],
    "table-transition": ["D3 · Table → image layout", "Warm destination renderer; the same source image is retained. Visible-image counts can differ by layout."],
    "detail-return": ["D4 · Return from detail", "Native close to the original image in the list, without detail traversal."],
    seek: ["D5 · Scrubber seek", "Placement and visible-media readiness after moving to a new neighbourhood."],
    reflow: ["D6 · Width change", "The viewport narrows from 1720px to 1100px around the same image."],
    "window-maintenance": ["D7 · Window eviction", "A jump into the admission band triggers real eviction. Not a constant-speed or necessarily equal-read-count comparison."],
    "scroll-constrained": ["D8 · Scroll / constrained network", "Revision 4 applies 80ms latency and 4Mibit/s download through the fixed load ladder and stopped recovery. Older four-second scroll-only profiles remain historical."],
    "burst-recovery": ["D9 · Burst, reverse and recover", "Fresh paired window; 3 seconds backward then 1.5 seconds forward at 4,000px/s. Browser-cache bypass continues through stopped-viewport recovery."],
    "scroll-endurance": ["D10 · Sustained scroll", "Three consecutive eight-second segments at 1,200px/s. Early/middle/late measurements retain in-flight requests across boundaries; dispatch gaps are recorded."],
    "refresh-contention": ["D11 · Search refresh / media overlap", "Matched same-query refreshes after drained versus active image traffic. Both use 80ms latency and 4Mibit/s download; check overlap evidence before interpreting a difference."],
  };
  // Value scale converts stored fractions into human percentages; histories remain untouched.
  const metricInfo = {
    requestedResultsPerSecond: ["Requested result demand", "results/s", 1, "diagnostic", "Actual fixed step demand, or the calibration reference for a whole journey.", "Revision 4 uses 30/100/200 results/s steps; compare achieved demand within the same step, not against one whole-journey target."],
    progressStruggle: ["Progress reference breached", "flag", 1, "diagnostic", "Per repetition, one when delivered rate is below 80%, pending slots exceed 20% or blocked input exceeds 5% in this step.", "A fixed descriptive reference, not an acceptance gate. Aggregate p95 retains adverse flags; unavailable evidence cannot earn a zero."],
    frameStruggle: ["Frame reference breached", "flag", 1, "diagnostic", "Per repetition, one when this step's frame-p95 exceeds 33.4ms.", "Independent of progress. No breach means only within this tested step and runtime, not universally smooth browsing."],
    firstProgressStruggleStep: ["First progress-reference breach", "step", 1, "diagnostic", "Per repetition: 1 gentle,2 reference,3 stress; zero means no breach through the strongest tested step.", "Aggregated first-step values can be fractional. The overview uses per-step flags instead of inventing a fractional load level."],
    firstFrameStruggleStep: ["First frame-reference breach", "step", 1, "diagnostic", "Per repetition: 1 gentle,2 reference,3 stress; zero means no breach through the strongest tested step.", "Not an overall winner or an exact capability threshold. Read per-step frames and delivered work together."],
    observerStopLagMs: ["Observer boundary lag", "ms", 1, "diagnostic", "Motion stop to observer stop, captured inside one browser job.", "More than25ms invalidates revision4. Controller-return delay is separate, not image recovery."],
    recoveryStartLagMs: ["Recovery observation start lag", "ms", 1, "diagnostic", "Last motion stop to first recovery observation inside the same browser job.", "More than25ms invalidates the capture; not a product-speed score."],
    controllerReturnLagMs: ["Controller-return delay", "ms", 1, "diagnostic", "Browser capture finished to controller observation of its return.", "Excluded from movement, frames and current-image recovery clocks."],
    achievedResultsPerSecond: ["Achieved result progress", "results/s", 1, "diagnostic", "Furthest visible directional frontier advance divided by journey time.", "Read with readiness and stable geometry. More progress alone does not mean better browsing; packing and sparse samples limit precision."],
    initialRunwayResults: ["Initial metadata runway", "results", 1, "diagnostic", "Loaded results beyond the initial visible frontier in the commanded direction.", "Measured separately from demand and delivery. Setup is not free prefetch; do not compare mismatched runway."],
    refillCoverageComplete: ["Repeated publication coverage", "count", 1, "diagnostic", "One when at least two publications occurred in the commanded direction, otherwise zero.", "Zero is inadequate supply coverage, not evidence of good performance. Resident controls intentionally have no refills."],
    appendPublications: ["Forward publications", "count", 1, "diagnostic", "Observed buffer publications extending the global end.", "Store publications, not HTTP counts. Check achieved progress and retention too."],
    prependPublications: ["Backward publications", "count", 1, "diagnostic", "Observed buffer publications extending the global start.", "Source identities stay browser-local. Counts alone do not certify stable geometry."],
    evictionPublications: ["Evicting publications", "count", 1, "diagnostic", "Publications that discard either end of the retained window.", "Distinct from appends/prepends; a publication may do both."],
    retainedDisplacementMaxPx: ["Retained-image displacement", "px", 1, "lower", "Largest adjacent-sample retained cell or image-element movement after adding back applied input, including common-mode movement.", "Raw visual boxes include animation. Compensation is counted separately, not subtracted to hide movement. DOM evidence is not every-frame paint proof; unavailable without a retained comparison."],
    retainedComparisonCensoredCount: ["Retained comparisons censored", "count", 1, "diagnostic", "Previously visible identities absent from the next visible sample.", "Departures are not successful stable comparisons; inspect retained comparison counts and sampling gaps."],
    stabilityObservationGapMaxMs: ["Largest stability sampling gap", "ms", 1, "lower", "Longest interval between retained-geometry observations.", "Transient movement or paint between samples can be missed. A clean sample is not every-frame certification."],
    paintMismatchCount: ["Paint mismatches", "count", 1, "diagnostic", "Unavailable in canonical journeys: bounded pixel controls are isolated fixtures, not live paint captures.", "Null is not zero flashes. DOM/source/load observations cannot certify every physical display frame."],
    priorJourneyVisibleRevisits: ["Images seen in a prior layout arm", "count", 1, "diagnostic", "Distinct identities in this journey already observed in an earlier layout arm of this workload.", "Browser-local bounded identities; no identities are persisted. Cache bypass does not guarantee cold decoded/proxy/CDN state."],
    retainedResizeMaxPx: ["Retained-image resize", "px", 1, "lower", "Largest width or height change for a retained visible identity.", "Sampled DOM geometry, not bitmap correctness or universal stability certification."],
    retainedSourceChanges: ["Retained-image source changes", "count", 1, "diagnostic", "Changes in declared source for the same retained visible identity.", "A source change is not automatically a wrong-image paint. Pixel controls establish detector limits separately."],
    retainedUnreadySamples: ["Retained images unready or hidden", "count", 1, "diagnostic", "Retained-image samples with incomplete, zero-intrinsic-size or hidden media.", "DOM/load evidence only, not measured blank paint duration. Missing media and decode readiness remain distinct."],
    compensationDistancePx: ["Non-input scroll movement", "px", 1, "diagnostic", "Absolute scroll-origin movement outside the driver's applied commands.", "Usually compensation, but not independently proven intentional. Retained displacement is the outcome oracle."],
    pendingVisibleRatioMean: ["Visible slots pending", "%", 100, "lower", "Time-weighted fraction of visible slots awaiting data or thumbnail readiness.", "Count-based, so Table's narrow thumbnail column cannot conceal pending images. Not exact paint or per-image latency."],
    severeFrameCount: ["Frames exceeding 50 ms", "count", 1, "lower", "Animation-frame intervals longer than 50 ms during observation.", "Interpret with achieved work, observation duration and probe cost; not input latency."],
    frameMaxMs: ["Longest frame interval", "ms", 1, "lower", "Largest observed animation-frame interval.", "A sample maximum, not a population-tail estimate."],
    observerSampleTotalMs: ["Thumbnail sampling cost", "ms", 1, "diagnostic", "Synchronous time inside thumbnail sampling, including geometry reads.", "Excludes asynchronous decode and event callbacks; matched observer-on/off controls characterize wider effects."],
    stabilitySampleTotalMs: ["Stability sampling cost", "ms", 1, "diagnostic", "Synchronous retained-cohort sample work across this journey.", "Includes geometry reads; not total observer overhead or a benchmark without instrumentation."],
    bufferEdgeBlockedMs: ["Input blocked at buffer edges", "ms", 1, "lower", "Equivalent commanded scrolling time clipped at temporary seek-mode buffer limits during D9.", "Not frame jank or native wheel latency. Zero alone is not edge-coverage proof; inspect movement and refill counts. True result ends are excluded."],
    bufferEdgeEpisodeCount: ["Temporary buffer wall episodes", "count", 1, "diagnostic", "Continuous episodes of input clipped at a temporary seek-buffer edge.", "True ends are excluded. Direction and phase boundaries end observation, not necessarily the physical wall."],
    bufferEdgeEpisodeMaxMs: ["Longest observed buffer wall", "ms", 1, "lower", "Longest sampled continuous temporary-wall episode during controlled scrolling.", "Includes lower bounds from censored episodes. Not accumulated blocked time or native-wheel latency; inspect achieved movement too."],
    bufferEdgeEpisodeCompletedMaxMs: ["Longest completed buffer wall", "ms", 1, "lower", "Longest temporary-wall episode observed to end before the input segment stopped.", "Unavailable if no episode completed. Compare censored episodes too; a direction reversal does not certify release."],
    bufferEdgeEpisodeCensoredCount: ["Buffer wall episodes censored", "count", 1, "diagnostic", "Episodes still open when their input segment ended.", "Reported durations are lower bounds; stopped input, direction changes and phase boundaries are not successful releases."],
    stopDataReadyMs: ["Stopped viewport data ready", "ms", 1, "lower", "Last commanded scroll to stable visible identities with no missing result slots.", "Shares the stop clock with decoded-media readiness; do not add the times. Unrelated speculative refills need not finish."],
    stopMediaReadyMs: ["Stopped viewport thumbnails decoded", "ms", 1, "lower", "Last commanded scroll to decoded media in the final visible viewport, after data readiness.", "A timeout, missing media or changed destination is unavailable, never a deadline-valued success. This is not exact compositor paint."],
    stopDataCensored: ["Stopped data recovery censored", "count", 1, "lower", "Per repetition: one if final data readiness was not established, zero if observed.", "Shown beside recovery time so unavailable results cannot look like instant success."],
    stopMediaCensored: ["Stopped media recovery censored", "count", 1, "lower", "Per repetition: one if final decoded-media readiness was not established.", "Failure, intentional media absence, timeout and changed destination do not produce successful latency samples."],
    forwardReadStarts: ["Forward refills admitted", "count", 1, "diagnostic", "Forward refill starts during D9 movement and recovery.", "These are store admissions, not HTTP transfers or backend work. Compare with movement, recovery and backward reads."],
    backwardReadStarts: ["Backward refills admitted", "count", 1, "diagnostic", "Backward refill starts during D9 movement and recovery.", "Earlier fetching may reduce stalls while increasing speculative work; lower is not automatically better."],
    readStartsAfterStop: ["Refills admitted after stopping", "count", 1, "diagnostic", "Refill starts after the last commanded movement, until recovery observation ends.", "Some may be needed for visible data; this is not automatically wasted traffic."],
    peakRefillsInFlight: ["Peak simultaneous refills", "count", 1, "diagnostic", "Maximum simultaneous forward and backward refills during D9.", "The store allows one per direction. This does not measure thumbnail concurrency."],
    refillsPendingAtEnd: ["Refills still pending at recovery end", "count", 1, "diagnostic", "Outstanding result refills when D9 finishes observing recovery.", "Visible readiness does not wait for unrelated speculation. Pending work has not been measured as completed or cancelled."],
    drivenDistancePx: ["Commanded movement achieved", "px", 1, "diagnostic", "Sum of movement directly applied by the controlled driver, excluding between-frame buffer compensation.", "D9 includes both directions. Compare only identical workload profiles; more movement is not by itself better responsiveness."],
    thumbnailPendingAreaRatioMean: ["Average blank thumbnail area", "%", 100, "lower", "Time-weighted area awaiting thumbnail load/decode, as a percentage of the results viewport.", "Slot-based estimate, not exact paint; excludes missing data and failures. Table's narrow thumbnail column can conceal persistent blanks behind a small percentage."],
    placeholderAreaRatioMean: ["Missing result-data area", "%", 100, "lower", "Time-weighted viewport area occupied by slots without loaded result metadata.", "Distinct from unloaded thumbnails. Indexed scrolling can expose missing data without meeting a physical wall; zero blocking is not sufficient."],
    thumbnailPendingAreaRatioMax: ["Worst sampled blank thumbnail area", "%", 100, "lower", "Largest sampled portion of the results viewport awaiting thumbnail load/decode.", "This is one frame sample, not the average and not bitmap-only area."],
    thumbnailBlankViewportMs: ["Time with any blank thumbnail", "ms", 1, "lower", "Time during which at least some visible thumbnail area was pending.", "4,000ms does not mean the entire viewport was blank for four seconds."],
    thumbnailVisibleWaitMaxMs: ["Longest observed visible thumbnail wait", "ms", 1, "lower", "Longest observed continuous interval with a visible thumbnail awaiting load/decode.", "Includes lower bounds from censored waits. Departure, replacement, failure or observation end need not mean the image became ready."],
    thumbnailVisibleWaitCompletedMaxMs: ["Longest completed visible thumbnail wait", "ms", 1, "lower", "Longest continuous visible wait observed to end in successful decode.", "Unavailable when no wait completed; compare censored waits too, not just successful images."],
    thumbnailVisibleWaitCensoredCount: ["Visible thumbnail waits censored", "count", 1, "diagnostic", "Waits whose successful visible decode was not observed before departure, replacement, failure or observation end.", "These are visibility episodes, not unique images or permanent failures."],
    mediaRequestStarts: ["Image requests started", "count", 1, "diagnostic", "Browser Image requests first observed during this measurement phase.", "Includes speculative work; fewer requests is not automatically better. Pre-existing requests outside the collector are not claimed."],
    mediaRequestCancellations: ["Image requests cancelled", "count", 1, "diagnostic", "Observed browser image cancellations among requests ending in this window.", "Not a user benefit by itself, completed-byte savings or proof that upstream work stopped."],
    mediaProxyCacheHits: ["Ended images with local proxy HIT", "count", 1, "diagnostic", "Ended image requests whose allowlisted local proxy header reported HIT.", "Separate from browser cache and decode reuse. Counts describe ended requests, not header-arrival phases or upstream savings."],
    mediaProxyCacheMisses: ["Ended images with local proxy MISS", "count", 1, "diagnostic", "Ended image requests whose allowlisted local proxy header reported MISS.", "Cold-first/warm-second comparisons are confounded. Browser-cache bypass does not clear proxy state."],
    mediaProxyCacheUnknown: ["Ended images without local proxy evidence", "count", 1, "diagnostic", "Ended requests without an exact local HIT/MISS header, including cancellations before headers.", "Unknown is not cold, warm or zero traffic. Canonical CDN headers are not interpreted as this local-proxy signal."],
    mediaRequestsPending: ["Image requests still in flight", "count", 1, "diagnostic", "Observed image requests still outstanding at the measurement boundary, including carry-in.", "This is network completion, not decode or paint; it can include off-screen work."],
    mediaRequestsPeak: ["Peak image requests in flight", "count", 1, "diagnostic", "Peak outstanding observed image requests within the phase, including carry-in.", "Request concurrency is not active connection count or backend load."],
    mediaCompletedBytes: ["Completed image transfer bytes", "kB", 0.001, "diagnostic", "CDP encoded transfer bytes for requests completed in the phase.", "Unavailable if redirect or missing-byte evidence prevents a complete total. Excludes pending/failed transfers; not backend work or decoded memory."],
    mediaRequestDurationMaxMs: ["Slowest completed image request", "ms", 1, "lower", "Longest browser request-start to completion interval among timed completed image requests.", "Incomplete requests are excluded; inspect pending work and visible waits too."],
    dataRequestStarts: ["Data requests started", "count", 1, "diagnostic", "Observed API/ES request starts during the phase.", "Can include counts or other overlapping data calls; this is not an exclusively action-owned request count."],
    dataRequestsPending: ["Data requests still in flight", "count", 1, "diagnostic", "Observed API/ES requests outstanding at the measurement boundary.", "Data publication and visible placement may occur later than network completion."],
    dataRequestDurationMaxMs: ["Slowest completed data request", "ms", 1, "lower", "Longest timed API/ES request interval completed during the phase.", "Browser-facing duration is not server CPU time and excludes unfinished requests."],
    dataBeforeSendMaxMs: ["Data request time before send", "ms", 1, "lower", "Longest request-start event to CDP send-start interval among usable completed data requests.", "Includes browser scheduling and connection work; not pure queue time or proof of media contention. Cached, redirected and unavailable timings are excluded."],
    dataSendToHeadersMaxMs: ["Data request send to response headers", "ms", 1, "lower", "Longest CDP send-start to first response-headers interval among usable completed data requests.", "Includes transport and service time, not server CPU alone. Phase maxima may belong to different requests and must not be added."],
    dataHeadersToCompleteMaxMs: ["Data response headers to completion", "ms", 1, "lower", "Longest first response-headers to loading-finished interval among usable completed data requests.", "Not JSON parsing, store publication or visible readiness. Phase maxima may belong to different requests."],
    dataTimingUnavailableCompletions: ["Data requests without usable phase timing", "count", 1, "diagnostic", "Completed data requests excluded from phase timing because clocks, redirects or cache evidence were unsuitable.", "Inspect alongside timing values. No usable sample means unavailable, not zero delay; pending requests are separate."],
    enduranceMaxGapMs: ["Largest endurance dispatch gap", "ms", 1, "lower", "Largest gap between consecutive controlled-scroll segments.", "A gap of 250ms or more invalidates the endurance capture; this is not a native-wheel measurement."],
    refreshComparisonCensored: ["Refresh overlap comparison censored", "count", 1, "diagnostic", "One when required drained/active media and data-request conditions were not established; paired deltas remain unavailable.", "Inspect p95 and sample counts: a median zero alone does not prove every repetition was usable."],
    refreshDataDeltaMs: ["Paired search publication delta", "ms", 1, "lower", "Media-active minus media-drained publication time, paired within each repetition; positive means slower.", "Unavailable without overlap evidence. This is not a difference of campaign medians or a server-only measurement."],
    refreshPlacementDeltaMs: ["Paired search placement delta", "ms", 1, "lower", "Media-active minus media-drained placement time within the same repetition.", "Shares the action clocks with publication and media readiness; do not add these deltas."],
    refreshMediaDeltaMs: ["Paired search decode delta", "ms", 1, "lower", "Media-active minus media-drained visible decode time within the same repetition.", "Unavailable when overlap or either decoded endpoint is censored. Do not add it to the publication delta."],
    decodedReadinessLeadPxMedian: ["Decoded before / after the screen edge", "px", 1, "lead", "Positive: decoded before entering the viewport. Negative: already inside when decoding completed.", "Initially ready pictures do not create a crossing event. Unavailable means insufficient observed events, not immediate readiness."],
    placementMs: ["Position settled", "ms", 1, "lower", "Action dispatch to observed stable placement of the intended image or destination.", "Placement does not imply thumbnail readiness. Includes driver dispatch; compare matching workload contracts."],
    mediaReadyMs: ["Visible thumbnails decoded", "ms", 1, "lower", "Action dispatch to successful decoding of the visible thumbnail set.", "Shares the placement clock's start: do not add these times. Layouts may show different numbers of pictures; censored results stay unavailable."],
    frameP95Ms: ["Slow-frame duration", "ms", 1, "lower", "Within each observation, the 95th-percentile animation-frame interval; this chart summarizes those per-run values.", "Not campaign action latency or a measurement of unloaded thumbnails. Instrumentation contributes overhead; do not compare with different probes."],
    layoutShiftRawValue: ["Layout-shift sum · all input states", "score", 1, "lower", "Sum of browser layout-shift entries during observation, including recent-input entries.", "Not official session-window CLS. Repainting alone is not a layout shift."],
    thumbnailShiftRawValue: ["Thumbnail-associated layout shifts", "score", 1, "lower", "Layout-shift entries whose reported source nodes belong to thumbnail slots.", "Attribution is not proof that the thumbnail caused the shift."],
    logicalOrderChanges: ["Order changes among surviving images", "count", 1, "diagnostic", "Observed changes in DOM order among identities present in consecutive samples.", "Zero means none observed; it is not proof about all scrolling or frame-level repaint behaviour."],
    imageIdentityChanges: ["Reused elements · identity changes", "count", 1, "diagnostic", "Times a tracked element changed which image identity it represented.", "Virtualized element reuse is expected. These are not unique images, and a larger count does not itself mean incorrect reordering."],
    failedCount: ["Failed thumbnail observations", "count", 1, "lower", "Observed load/decode failures across element/source generations.", "Separate from intentionally absent thumbnails and still-pending downloads."],
    pendingAtEnd: ["Visible slots still pending at stop", "count", 1, "lower", "Visible image or data-placeholder slots still pending when observation ended.", "Includes missing result data. A median can be fractional even though each repetition counted whole slots."],
    actualSpeedPxPerSec: ["Achieved scroll speed", "px/s", 1, "diagnostic", "Observed scroll distance divided by elapsed observation time.", "D1/D2/D8 target 1,200px/s. D7 is a tail-admission jump, not a constant-speed comparison; corrections can also affect scroll distance."],
    pendingAreaRatioMean: ["Average pending content area", "%", 100, "lower", "Time-weighted viewport area awaiting thumbnails OR missing result data.", "Combined diagnostic. Prefer thumbnail-only exposure when available; keep placeholder exposure separate."],
  };
  for (const [prefix, label] of [["early", "Early"], ["middle", "Middle"], ["late", "Late"], ["reversal", "Reverse"], ["recovery", "Recovery"]]) {
    for (const key of ["thumbnailPendingAreaRatioMean", "thumbnailVisibleWaitMaxMs", "thumbnailVisibleWaitCensoredCount",
      "pendingVisibleRatioMean", "severeFrameCount", "frameMaxMs", "observerSampleTotalMs", "bufferEdgeBlockedMs",
      "placeholderAreaRatioMean", "bufferEdgeEpisodeCount", "bufferEdgeEpisodeMaxMs",
      "bufferEdgeEpisodeCompletedMaxMs", "bufferEdgeEpisodeCensoredCount",
      "dataBeforeSendMaxMs", "dataSendToHeadersMaxMs", "dataHeadersToCompleteMaxMs", "dataTimingUnavailableCompletions",
      "frameP95Ms", "drivenDistancePx", "mediaRequestStarts", "mediaRequestsPending", "mediaRequestsPeak", "mediaRequestCancellations",
      "mediaProxyCacheHits", "mediaProxyCacheMisses", "mediaProxyCacheUnknown", "requestedResultsPerSecond", "achievedResultsPerSecond", "progressStruggle", "frameStruggle",
      "mediaCompletedBytes", "dataRequestStarts", "dataRequestsPending", "dataRequestDurationMaxMs"]) {
      const [title, unit, scale, direction, description, caution] = metricInfo[key];
      metricInfo[prefix + key[0].toUpperCase() + key.slice(1)] = [`${label} · ${title}`, unit, scale, direction,
        `${label} journey segment; duration belongs to the versioned workload. ${description}`, caution];
    }
  }
  for (const [prefix, label] of [["quiet", "Media-drained"], ["busy", "Media-active"]]) {
    for (const key of ["dataBeforeSendMaxMs", "dataSendToHeadersMaxMs", "dataHeadersToCompleteMaxMs", "dataTimingUnavailableCompletions"]) {
      const [title, unit, scale, direction, description, caution] = metricInfo[key];
      metricInfo[prefix + key[0].toUpperCase() + key.slice(1)] = [`${label} · ${title}`, unit, scale, direction, description, caution];
    }
    for (const [key, title, caution] of [
      ["DataReadyMs", "search data published", "Action-owned store publication, not a latest-store timing snapshot or server-only duration."],
      ["PlacementMs", "search position settled", "Shares the action start with publication and media readiness; do not add the times."],
      ["MediaReadyMs", "visible search images decoded", "Unavailable recovery remains censored, not a deadline-valued success. This is not exact paint."],
    ]) metricInfo[prefix + key] = [`${label} · ${title}`, "ms", 1, "lower", "Measured from this same-query refresh dispatch.", caution];
    metricInfo[prefix + "MediaPendingAtDispatch"] = [`${label} · image requests at dispatch`, "count", 1, "diagnostic",
      "Observed image requests active at the action timestamp.", "Unknown clocks remain unavailable. A completed off-screen image is not by itself a priority violation."];
    metricInfo[prefix + "DataPendingAtDispatch"] = [`${label} · data requests at dispatch`, "count", 1, "diagnostic",
      "Observed pre-existing API/ES requests active at refresh dispatch.", "Existing data traffic can confound a media-only contention comparison."];
    metricInfo[prefix + "MediaCensored"] = [`${label} · visible decode censored`, "count", 1, "diagnostic",
      "One when visible decoded readiness was not established.", "Inspect censoring alongside readiness times."];
  }
  const allMetrics = [...new Set(rows.flatMap(row => Object.keys(row.record.metrics ?? {})))].sort();
  for (const [key, title, unit, description] of [
    ["requestedResultsPerSecond", "Requested browsing rate", "results/s", "Target demand calibrated from actual visible row geometry; not the achieved rate."],
    ["resultsPerPixel", "Results per pixel", "results/px", "Initial visible row-start calibration. Justified packing can change as more dimensions arrive."],
    ["initialRunwayMs", "Initial metadata runway time", "ms", "Loaded results beyond the initial visible frontier divided by requested result demand."],
    ["initialBufferCount", "Initially loaded results", "count", "Metadata retained when this journey starts; not a media-cache guarantee."],
    ["initialVisibleImages", "Initially visible images", "count", "Visible identities in the first journey sample; layouts show different populations."],
    ["freshVisibleImages", "Distinct images in this journey", "count", "Includes the initial viewport. First seen within this observation does not mean cold media."],
    ["revisitedVisibleImages", "Visible re-entries within this journey", "count", "Identities returning after leaving a sampled viewport; not network retries."],
    ["progressedResults", "Result frontier advanced", "results", "Furthest visible ordinal advance in the commanded direction; not accumulated back-and-forth travel."],
    ["appliedInputDistancePx", "Applied input distance", "px", "Movement applied by the driver, excluding external scroll-origin compensation."],
    ["journeyDurationMs", "Observed journey duration", "ms", "Elapsed journey observation including phase dispatch gaps."],
    ["retainedComparisons", "Retained-image comparisons", "count", "Adjacent-sample comparisons of the same visible identity. Without comparisons, geometry is unavailable."],
    ["retainedNodeReplacements", "Retained image nodes replaced", "count", "Same visible identity on a different image element. Replacement alone is not a visible defect."],
    ["visibleImageSamples", "Visible-image samples", "count", "Sum of visible identities across observations, not distinct images."],
    ["positionMapPresent", "Position map present at start", "count", "One when a map was available at journey start; zero means absent, not a seek-mode change."],
    ["containerWidth", "Results viewport width", "px", "Actual measured container width used to characterize demand."],
    ["containerHeight", "Results viewport height", "px", "Actual measured container height, independent of browser outer size."],
    ["devicePixelRatio", "Device pixel ratio", "ratio", "Physical-pixel density; affects media/render pressure independently of results per second."],
    ["stabilitySampleCount", "Geometry samples", "count", "Bounded retained-cohort observations; sampling gaps remain a separate limit."],
    ["stabilitySampleMaxMs", "Slowest geometry sample", "ms", "Largest synchronous sample cost, not total instrumentation overhead."],
    ["observerSampleCount", "Thumbnail samples", "count", "Thumbnail observation calls; asynchronous load/decode callbacks are outside sample-cost totals."],
    ["observerSampleMaxMs", "Slowest thumbnail sample", "ms", "Largest synchronous thumbnail sample cost, not exact app slowdown."],
    ["paintCaptureAvailable", "Paint capture available", "count", "Canonical journeys record zero: paint is not captured. Pixel controls are separate fixtures."],
  ]) metricInfo[key] = [title, unit, 1, "diagnostic", description, "Compare matching workload contracts and inspect coverage; missing evidence is unavailable, never zero."];
  const coreKey = key => key.replace(/^(early|middle|late|quiet|busy|reversal|recovery)([A-Z])/, (_match, _prefix, letter) => letter.toLowerCase());
  for (const field of allMetrics) {
    const key = coreKey(field);
    if (!metricInfo[key] && /(?:CaptureRevision|Overflow|Detached)$/.test(key)) metricInfo[key] = [
      key.replace(/([a-z])([A-Z])/g, "$1 $2"), /Revision$/.test(key) ? "revision" : "count", 1, "diagnostic",
      /Revision$/.test(key) ? "Version of this measurement contract; changed versions are not interchangeable."
        : "Nonzero invalidates this capture. It is not a performance score.", "No value means this instrument was not recorded in that historical workload."];
  }
  const keyMetrics = new Set(["achievedResultsPerSecond", "initialRunwayResults", "refillCoverageComplete", "bufferEdgeBlockedMs",
    "bufferEdgeEpisodeMaxMs", "thumbnailPendingAreaRatioMean", "thumbnailPendingAreaRatioMax", "pendingVisibleRatioMean",
    "thumbnailVisibleWaitMaxMs", "thumbnailVisibleWaitCensoredCount", "decodedReadinessLeadPxMedian", "placeholderAreaRatioMean",
    "stopDataReadyMs", "stopMediaReadyMs", "frameP95Ms", "severeFrameCount", "frameMaxMs", "retainedDisplacementMaxPx",
    "retainedResizeMaxPx", "retainedSourceChanges", "retainedUnreadySamples", "paintMismatchCount", "mediaRequestsPending",
    "dataBeforeSendMaxMs", "refreshDataDeltaMs", "refreshMediaDeltaMs", "placementMs", "mediaReadyMs", "requestedResultsPerSecond", "progressStruggle", "frameStruggle",
    "mediaRequestCancellations", "mediaProxyCacheHits", "mediaProxyCacheMisses", "mediaProxyCacheUnknown", "mediaCompletedBytes"]);
  const categoryFor = key => /^(retained|stabilityObservation|paint)|[Ss]hift|logicalOrder|imageIdentity/.test(key) ? "stability"
    : /[Ff]rame/.test(key) ? "smoothness"
    : /[Rr]equest|[Bb]ytes|ProxyCache|CacheResponses|dataBefore|dataSend|dataHeaders|dataTiming|refresh.*Delta|MediaPendingAtDispatch/.test(key) ? "delivery"
    : /[Rr]evision|[Cc]apture|[Oo]verflow|[Ss]ample|[Cc]ost|[Cc]omparison|[Cc]overage|[Pp]ublications|[Rr]eadStarts|[Rr]efills|[Rr]unway|[Pp]erPixel|[Rr]evisits|[Vv]isibleImages|[Cc]ontainer|devicePixel|[Pp]ositionMap|initialBuffer|compensation|[Cc]ommanded/.test(key) ? "coverage" : "progress";
  const phases = { "": "Whole observation", early: "Early / gentle in r4", middle: "Middle / reference in r4", late: "Late / stress in r4", quiet: "Media-drained", busy: "Media-active", reversal: "Reverse leg", recovery: "Stopped recovery" };
  const baseMetric = key => key.replace(/^(early|middle|late|quiet|busy|reversal|recovery)([A-Z])/, (_match, _prefix, letter) => letter.toLowerCase());
  const fieldFor = (key, phase) => phase && key ? phase + key[0].toUpperCase() + key.slice(1) : key;
  const selectedMetricKey = () => fieldFor(controls.Metric.value, $("phase").value);
  const environments = [...new Set(entries.map(e => e.environmentCompatibilityKey).filter(Boolean))];
  const friendlyEnv = key => {
    const e = entries.find(entry => entry.environmentCompatibilityKey === key)?.environment;
    if (!e) return "Unverified environment";
    const label = KupuaPerfComparison.label({ environment: e });
    const same = environments.filter(other => {
      const v = entries.find(entry => entry.environmentCompatibilityKey === other)?.environment;
      return v?.dataMode === e.dataMode && v?.apiTopology === e.apiTopology && v?.mediaDelivery === e.mediaDelivery;
    });
    return `${label}${same.length > 1 ? ` · configuration ${same.indexOf(key) + 1}` : ""}`;
  };
  const profileName = p => p?.startsWith("density-v4-") ? p.includes("4mbps") ? "Constrained load ladder / recovery" : "Ordinary load ladder / recovery"
    : p?.includes("100resultsps") ? "100 results/s directional journey" : p?.includes("endurance") ? "Sustained scroll" : p?.includes("refresh-media-overlap") ? "Search / media overlap"
    : p?.includes("recovery") ? "Burst / reversal recovery" : p?.includes("scroll-only") ? "Constrained scroll" : p?.includes("unthrottled") ? "Unthrottled" : "Other / historical profile";
  const infoFor = key => {
    if (metricInfo[key]) return metricInfo[key];
    const base = baseMetric(key);
    if (base !== key && metricInfo[base]) {
      const prefix = key.match(/^(early|middle|late|quiet|busy|reversal|recovery)/)[0];
      const [title, ...rest] = metricInfo[base];
      return [`${phases[prefix]} · ${title}`, ...rest];
    }
    const unit = /AreaMs$/.test(key) ? "px²·ms" : /Ratio/.test(key) ? "%" : /PxPerSec/.test(key) ? "px/s"
      : /Shift.*Value$/.test(key) ? "score" : /Ms$/.test(key) ? "ms" : /Px/.test(key) ? "px" : /Revision$/.test(key) ? "revision" : "count";
    return [key.replace(/([a-z])([A-Z])/g, "$1 $2"), unit, unit === "%" ? 100 : 1, "diagnostic", "Additional recorded diagnostic; not an overall performance score.", "Technical field name is shown below. Consult the performance handbook for the observation boundary."];
  };
  const option = (value, label) => { const el = make("option", label); el.value = value; return el; };
  $("campaign").append(option("", "All campaigns (measurements)"), ...entries.map((entry, index) =>
    option(String(index), `${entry.label || "Unnamed campaign"} · ${KupuaPerfComparison.label(entry)} · ${date(entry.timestamp)}`)).reverse());
  $("campaign").value = entries.length ? String(entries.length - 1) : "";
  function populateBaselines() {
    const selected = $("campaign").value === "" ? entries.length - 1 : Number($("campaign").value);
    $("baseline").replaceChildren(option("", "No comparison"), ...entries.flatMap((entry, index) => index === selected ? [] :
      [option(String(index), `${entry.label} · ${KupuaPerfComparison.label(entry)} · ${date(entry.timestamp)}`)]).reverse());
    $("baseline").value = selected > 0 ? String(selected - 1) : "";
  }
  populateBaselines();
  let dashboardView = "overview";
  let view = "latest";
  const controls = { Metric: $("metric"), Environment: $("environment") };
  controls.Environment.append(option("", "All environments · kept separate"), ...environments.map(key => option(key, friendlyEnv(key))));
  if (entries.some(e => !e.environmentCompatibilityKey)) controls.Environment.append(option("unverified", "Unverified environments"));
  function filter(name, field, labels = value => value) {
    const label = make("label", name), select = make("select");
    select.setAttribute("aria-label", name);
    select.append(option("", "All"), ...[...new Set(rows.map(r => r.record[field]).filter(Boolean))].map(value => option(value, labels(value))));
    label.append(select); $("filters").append(label); controls[name] = select;
    select.addEventListener("change", render);
  }
  filter("Workload", "workload", key => workload[key]?.[0] ?? key);
  filter("Density", "density", key => names[key] ?? key);
  filter("Regime", "resultRegime");
  filter("Profile", "profile", profileName);
  const statLabel = make("label", "Statistic"), statistic = make("select");
  statistic.setAttribute("aria-label", "Statistic"); statistic.append(option("median", "Median of repetitions"), option("p95", "p95 of repetitions"));
  statLabel.append(statistic); $("filters").append(statLabel); controls.Statistic = statistic;
  statistic.addEventListener("change", render);
  function selectionRows() {
    const selected = $("campaign").value, campaign = entries[Number(selected)];
    const contracts = new Set(Object.values(campaign?.metrics ?? {}).map(record => record.pairedContractKey).filter(Boolean));
    return rows.filter(row => (!controls.Environment.value || (controls.Environment.value === "unverified" ? !row.entry.environmentCompatibilityKey : row.entry.environmentCompatibilityKey === controls.Environment.value))
      && [["Workload", "workload"], ["Density", "density"], ["Regime", "resultRegime"], ["Profile", "profile"]].every(([name, field]) => !controls[name].value || row.record[field] === controls[name].value)
      && (selected === "" || (view === "latest" ? row.campaign === Number(selected)
        : row.campaign <= Number(selected) && row.entry.environmentCompatibilityKey === campaign?.environmentCompatibilityKey && contracts.has(row.record.pairedContractKey))));
  }
  function hasEvidence(record, key) {
    const value = record.metrics[key];
    if (!value) return false;
    if (Number.isFinite(value.median) || Number.isFinite(value.p95) || value.sampleCount > 0) return true;
    const base = baseMetric(key), prefix = key === base ? "" : key.slice(0, key.length - base.length);
    const censor = { stopMediaReadyMs: "stopMediaCensored", stopDataReadyMs: "stopDataCensored", mediaReadyMs: "mediaCensored",
      thumbnailVisibleWaitCompletedMaxMs: "thumbnailVisibleWaitCensoredCount", bufferEdgeEpisodeCompletedMaxMs: "bufferEdgeEpisodeCensoredCount",
      refreshMediaDeltaMs: "refreshComparisonCensored", refreshDataDeltaMs: "refreshComparisonCensored", refreshPlacementDeltaMs: "refreshComparisonCensored" }[base];
    return Boolean(censor && record.metrics[fieldFor(censor, prefix)]?.p95 > 0);
  }
  function availableFields() {
    return [...new Set(selectionRows().flatMap(row => Object.keys(row.record.metrics).filter(key => hasEvidence(row.record, key))))];
  }
  function populateMetrics() {
    const previous = controls.Metric.value;
    const fields = availableFields();
    const available = [...new Set(fields.map(baseMetric))];
    const preferred = Object.keys(metricInfo).filter(key => baseMetric(key) === key && available.includes(key));
    const search = $("metric-search").value.trim().toLowerCase();
    const focus = $("metric-focus").value;
    const expanded = $("all-metrics").checked || Boolean(search) || Boolean(focus);
    const candidates = expanded ? [...preferred, ...available.filter(key => !preferred.includes(key))]
      : preferred.filter(key => keyMetrics.has(key));
    const keys = (candidates.length || expanded ? candidates : available).filter(key =>
      (!focus || categoryFor(key) === focus) && (!search || `${key} ${infoFor(key)[0]} ${allMetrics.filter(field => baseMetric(field) === key).join(" ")}`.toLowerCase().includes(search)));
    controls.Metric.replaceChildren(...keys.map(key => option(key, `${infoFor(key)[0]} · ${infoFor(key)[1]}`)));
    const fallback = available.includes("thumbnailPendingAreaRatioMean") ? "thumbnailPendingAreaRatioMean" : available.includes("pendingAreaRatioMean") ? "pendingAreaRatioMean" : keys[0];
    controls.Metric.value = keys.includes(previous) ? previous : keys.includes(fallback) ? fallback : keys[0] ?? "";
    populatePhases();
  }
  function populatePhases() {
    const previous = $("phase").value;
    const fields = availableFields();
    const available = Object.keys(phases).filter(phase => fields.includes(fieldFor(controls.Metric.value, phase)));
    $("phase").replaceChildren(...available.map(phase => option(phase, phases[phase])));
    $("phase").value = available.includes(previous) ? previous : available.includes("late") ? "late" : available[0] ?? "";
    $("phase").disabled = available.length < 2;
  }
  populateMetrics();
  let tooltipTarget = null;
  const tooltip = $("tooltip");
  const fmt = (value, key = controls.Metric.value, delta = false) => {
    if (!Number.isFinite(value)) return "unavailable";
    const [, unit, scale] = infoFor(key), scaled = value * scale;
    const small = Math.abs(scaled) > 0 && Math.abs(scaled) < 0.001;
    const digits = unit === "score" ? 6 : unit === "results/px" ? 5 : unit === "%" ? 2 : 1;
    const result = small ? scaled.toExponential(1) : scaled.toLocaleString(undefined, { maximumFractionDigits: digits });
    return `${delta && scaled > 0 ? "+" : ""}${result}${unit === "count" ? "" : unit === "%" && !delta ? "%" : ` ${delta && unit === "%" ? "pp" : unit}`}`;
  };
  const valueOf = (row, stat = controls.Statistic.value) => row.record.metrics[selectedMetricKey()]?.[stat];
  const matches = row => (!controls.Environment.value || (controls.Environment.value === "unverified" ? !row.entry.environmentCompatibilityKey : row.entry.environmentCompatibilityKey === controls.Environment.value)) &&
    [["Workload", "workload"], ["Density", "density"], ["Regime", "resultRegime"], ["Profile", "profile"]].every(([name, field]) => !controls[name].value || row.record[field] === controls[name].value);
  function hideTooltip() {
    tooltip.hidden = true;
    tooltipTarget?.removeAttribute("aria-describedby"); tooltipTarget = null;
  }
  function showTooltip(row, mark, event) {
    hideTooltip(); tooltipTarget = mark; mark.setAttribute("aria-describedby", "tooltip");
    const key = selectedMetricKey(), value = row.record.metrics[key];
    tooltip.replaceChildren(make("strong", `${names[row.record.density] ?? row.record.density} · ${friendlyEnv(row.entry.environmentCompatibilityKey)}`),
      make("div", `${infoFor(key)[0]}: ${fmt(valueOf(row))}`),
      make("div", `Median ${fmt(value?.median)} · p95 ${fmt(value?.p95)}`),
      make("div", `${value?.sampleCount ?? 0}/${row.record.sampleCount} repetitions available`),
      make("div", `${row.entry.label} · ${date(row.entry.timestamp)}`),
      make("div", `${profileName(row.record.profile)} · ${row.record.resultRegime} · revision ${row.record.scenarioRevision}`));
    if (mark.closest(".history-chart")) {
      const peers = rows.filter(other => row.record.pairedContractKey && other.campaign === row.campaign && other.record.pairedContractKey === row.record.pairedContractKey && other.record.id !== row.record.id && matches(other));
      for (const peer of peers) tooltip.append(make("div", `${names[peer.record.density]} in this campaign: ${fmt(valueOf(peer))} (${peer.record.metrics[key]?.sampleCount ?? 0}/${peer.record.sampleCount} samples)`));
    }
    if (row.record.density === "table" && /AreaRatio/.test(key)) tooltip.append(make("div", "Table has a narrow thumbnail column; a small viewport percentage can still mean persistent missing thumbnails."));
    if (key === "mediaReadyMs") tooltip.append(make("div", "Same start clock as placement; not an additional wait."));
    tooltip.hidden = false;
    const box = mark.getBoundingClientRect();
    const x = event?.clientX ?? box.left + box.width / 2, y = event?.clientY ?? box.top + box.height / 2;
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - tooltip.offsetWidth - 8, x + 12))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(innerHeight - tooltip.offsetHeight - 8, y + 14))}px`;
  }
  function date(timestamp) {
    const value = new Date(timestamp);
    return Number.isFinite(value.valueOf()) ? value.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : timestamp ?? "Unknown date";
  }
  function svgElement(svg, tag, attrs, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text != null) node.textContent = text;
    svg.append(node); return node;
  }
  function mark(svg, row, x, y, draw) {
    const group = svgElement(svg, "g", { class: "mark", tabindex: 0, role: "img", "aria-label": `${names[row.record.density]}: ${fmt(valueOf(row))}; ${date(row.entry.timestamp)}; ${row.record.metrics[selectedMetricKey()]?.sampleCount ?? 0}/${row.record.sampleCount} samples` });
    draw(group);
    svgElement(group, "rect", { x: x - 13, y: y - 14, width: 26, height: 28, fill: "transparent" });
    group.addEventListener("mouseenter", event => showTooltip(row, group, event));
    group.addEventListener("mouseleave", () => { if (document.activeElement !== group) hideTooltip(); });
    group.addEventListener("focus", () => showTooltip(row, group));
    group.addEventListener("blur", hideTooltip);
    group.addEventListener("click", event => showTooltip(row, group, event));
    group.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); showTooltip(row, group); } });
  }
  function scaleFor(selected) {
    const values = selected.map(row => valueOf(row)).filter(Number.isFinite).map(v => v * infoFor(controls.Metric.value)[2]);
    let min = Math.min(0, ...values), max = Math.max(0, ...values);
    if (min === max) max = 1;
    const rough = (max - min) / 4, magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].find(n => n * magnitude >= rough) * magnitude;
    min = Math.floor(min / step) * step; max = Math.ceil(max / step) * step;
    const ticks = []; for (let n = min; n <= max + step / 2; n += step) ticks.push(n);
    return { min, max, ticks, scaled: v => v * infoFor(controls.Metric.value)[2] };
  }
  function drawLatest(card, selected, scale) {
    const shown = [...selected].sort((a, b) => ["grid", "justified", "table"].indexOf(a.record.density) - ["grid", "justified", "table"].indexOf(b.record.density));
    const height = 50 + shown.length * 48;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", `0 0 540 ${height}`); svg.setAttribute("class", "chart latest-chart"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Latest values by density"); card.append(svg);
    const x = value => 90 + (scale.scaled(value) - scale.min) / (scale.max - scale.min) * 325;
    const zero = x(0);
    for (const tick of scale.ticks) {
      const at = 90 + (tick - scale.min) / (scale.max - scale.min) * 325;
      svgElement(svg, "line", { x1: at, x2: at, y1: 12, y2: height - 30, stroke: "#4b556350" });
      svgElement(svg, "text", { x: at, y: height - 8, "text-anchor": "middle" }, fmt(tick / infoFor(controls.Metric.value)[2]));
    }
    shown.forEach((row, index) => {
      const y = 32 + index * 48, value = valueOf(row), color = colors[row.record.density] ?? "#aaa";
      svgElement(svg, "text", { x: 0, y: y + 4 }, names[row.record.density]);
      if (!Number.isFinite(value)) { svgElement(svg, "text", { x: 100, y: y + 4 }, "unavailable"); return; }
      const at = x(value);
      mark(svg, row, at, y, group => {
        svgElement(group, "rect", { x: Math.min(zero, at), y: y - 10, width: Math.max(1, Math.abs(at - zero)), height: 20, fill: color, opacity: .65, rx: 3 });
        svgElement(group, "circle", { class: "dot", cx: at, cy: y, r: 5, fill: color });
      });
      svgElement(svg, "text", { x: 435, y: y + 4 }, fmt(value));
    });
  }
  function drawHistory(card, selected, scale) {
    const campaigns = [...new Set(selected.map(r => r.campaign))].sort((a, b) => a - b);
    if (campaigns.length === 1) {
      drawLatest(card, selected, scale);
      card.append(make("p", "One campaign: baseline only, no trend yet.", "small muted"));
      return;
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 540 235"); svg.setAttribute("class", "chart history-chart"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Compatible campaign history"); card.append(svg);
    const x = c => campaigns.length === 1 ? 285 : 80 + campaigns.indexOf(c) / (campaigns.length - 1) * 415;
    const y = v => 185 - (scale.scaled(v) - scale.min) / (scale.max - scale.min) * 160;
    for (const tick of scale.ticks) {
      const at = y(tick / infoFor(controls.Metric.value)[2]);
      svgElement(svg, "line", { x1: 75, x2: 505, y1: at, y2: at, stroke: "#4b556350" });
      svgElement(svg, "text", { x: 68, y: at + 4, "text-anchor": "end" }, fmt(tick / infoFor(controls.Metric.value)[2]));
    }
    for (const [index, c] of campaigns.entries()) {
      if (index % Math.ceil(campaigns.length / 4) === 0 || index === campaigns.length - 1) svgElement(svg, "text", { x: x(c), y: 211, "text-anchor": "middle" }, `#${c + 1} · ${new Date(entries[c].timestamp).toLocaleDateString()}`);
    }
    for (const density of ["grid", "justified", "table"]) {
      const series = selected.filter(r => r.record.density === density).sort((a, b) => a.campaign - b.campaign);
      let segment = [];
      const draw = () => { if (segment.length > 1) svgElement(svg, "polyline", { class: "series-line", points: segment.join(" "), fill: "none", stroke: colors[density], "stroke-width": 2 }); segment = []; };
      for (const row of series) {
        const value = valueOf(row); if (!Number.isFinite(value)) { draw(); continue; }
        const at = x(row.campaign), top = y(value); segment.push(`${at},${top}`);
        mark(svg, row, at, top, group => svgElement(group, "circle", { class: "dot", cx: at, cy: top, r: 6, fill: colors[density], stroke: "#101318", "stroke-width": 2 }));
      }
      draw();
    }
    card.append(make("p", campaigns.length === 1 ? "One campaign: baseline only, no trend yet. Use Latest comparisons to distinguish overlapping values." : `${campaigns.length} compatible campaigns; gaps remain unavailable.`, "small muted"));
    const labels = make("ol", null, "small muted");
    for (const index of campaigns) labels.append(make("li", `#${index + 1} · ${entries[index].label}${String(index) === $("baseline").value ? " · comparison baseline" : ""}`));
    card.append(labels);
  }
  function tableRow(target, values) { const tr = make("tr"); values.forEach(value => tr.append(make("td", value))); target.append(tr); }
  function completeValue(record, key) {
    const value = record?.metrics?.[key];
    return Number.isInteger(record?.sampleCount) && record.sampleCount > 0 && value?.sampleCount === record.sampleCount
      && Number.isFinite(value.median) && Number.isFinite(value.p95) ? value.median : null;
  }
  function captureIs(record, key, expected) {
    return completeValue(record, key) === expected && record.metrics[key].p95 === expected;
  }
  function pressureCaptureValid(record) {
    return record?.scenarioRevision === 4 && record.profile?.startsWith("density-v4-30-100-200resultsps")
      && captureIs(record, "pressureCaptureRevision", 1) && captureIs(record, "timingCaptureRevision", 2)
      && captureIs(record, "requestWindowCaptureRevision", 1) && captureIs(record, "requestClockMissingCount", 0)
      && ["observerStopLagMs", "recoveryStartLagMs"].every(key => completeValue(record, key) !== null && record.metrics[key].p95 <= 25)
      && ["early", "middle", "late"].every((prefix, index) => captureIs(record, fieldFor("requestedResultsPerSecond", prefix), [30, 100, 200][index])
        && captureIs(record, fieldFor("requestWindowCaptureRevision", prefix), 1) && captureIs(record, fieldFor("requestClockMissingCount", prefix), 0));
  }
  function renderPressure(entry) {
    const formatNumber = value => Number.isFinite(value)
      ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "unavailable";
    const records = Object.values(entry?.metrics ?? {}).filter(record => record.scenarioRevision === 4
      && ["scroll-forward", "scroll-backward", "scroll-constrained"].includes(record.workload));
    $("pressure-panel").hidden = records.length === 0;
    $("pressure-rows").replaceChildren(); $("pressure-costs").replaceChildren(); $("landing-alerts").replaceChildren();
    $("landing-alerts").hidden = records.length === 0;
    if (records.length) $("landing-alerts").append(make("strong", "Constrained landing", "small"));
    const stepLabels = ["gentle 30", "reference 100", "stress 200"];
    for (const record of records) {
      const row = make("tr"); row.id = `pressure-${record.density}-${record.workload}`;
      const direction = record.workload === "scroll-backward" ? "backward" : "forward";
      const constrained = record.workload === "scroll-constrained";
      const context = make("th", `${names[record.density]} · ${direction}`); context.scope = "row";
      context.append(make("p", constrained ? "Constrained" : "Ordinary", "muted")); row.append(context);
      for (const [index, prefix] of ["early", "middle", "late"].entries()) {
        const read = name => completeValue(record, fieldFor(name, prefix));
        const cell = make("td", null, "load-cell"), inspectStep = make("button", null, "load-button"); inspectStep.type = "button";
        inspectStep.setAttribute("aria-label", `Inspect ${names[record.density]} ${direction} ${constrained ? "constrained" : "ordinary"} ${stepLabels[index]}`);
        inspectStep.title = `Requested ${formatNumber(read("requestedResultsPerSecond"))} results/s; achieved ${formatNumber(read("achievedResultsPerSecond"))}; blocked ${formatNumber(read("bufferEdgeBlockedMs"))} ms`;
        inspectStep.append(make("span", stepLabels[index], "pressure-step-label"),
          make("strong", read("pendingVisibleRatioMean") === null ? "Ready: unavailable" : `Ready: ${formatNumber(100 * (1 - read("pendingVisibleRatioMean")))}%`, record.metrics[fieldFor("progressStruggle", prefix)]?.p95 > 0 ? "adverse" : "ready"),
          make("span", `Frame-p95: ${formatNumber(read("frameP95Ms"))} ms`, record.metrics[fieldFor("frameStruggle", prefix)]?.p95 > 0 ? "adverse" : ""),
          make("span", `${formatNumber(read("achievedResultsPerSecond"))} / ${formatNumber(read("requestedResultsPerSecond"))} results/s`, "muted"));
        inspectStep.addEventListener("click", () => openMeasurement("pendingVisibleRatioMean", record.density, prefix, record.workload));
        cell.append(inspectStep);
        row.append(cell);
      }
      const landing = make("td", null, "pressure-landing"), media = record.metrics.stopMediaReadyMs;
      const censored = !captureIs(record, "stopMediaCensored", 0);
      landing.append(make("p", `${media?.sampleCount ?? 0}/${record.sampleCount} stable decoded landings`, censored ? "landing-reason" : ""),
        make("p", completeValue(record, "stopMediaReadyMs") !== null ? `Decode median: ${formatNumber(media.median)} ms · worst ${formatNumber(media.p95)} ms` : landingOutcome(record), "small"));
      if (record.workload === "scroll-backward") landing.append(make("p", "After the reverse leg", "muted"));
      landing.append(recoveryEvidence(record));
      const cost = make("div", null, "cost-row"); cost.append(make("strong", `${names[record.density]} · ${direction} · ${constrained ? "Constrained" : "Ordinary"}`),
        make("p", `Motion cancellations: ${formatNumber(completeValue(record, "mediaRequestCancellations"))} · proxy hits / misses / unknown: ${["mediaProxyCacheHits", "mediaProxyCacheMisses", "mediaProxyCacheUnknown"].map(key => formatNumber(completeValue(record, key))).join(" / ")}`));
      const costsLink = make("button", "Inspect cancellations", "inspect"); costsLink.type = "button";
      costsLink.disabled = !hasEvidence(record, "mediaRequestCancellations");
      costsLink.addEventListener("click", () => openMeasurement("mediaRequestCancellations", record.density, "", record.workload));
      cost.append(costsLink); $("pressure-costs").append(cost);
      if (constrained) {
        const alert = make("button", `${names[record.density]}: ${media?.sampleCount ?? 0}/${record.sampleCount} stable landings · ${censored ? landingOutcome(record) : `${formatNumber(media.median)} ms median`}`, "inspect"); alert.type = "button";
        alert.addEventListener("click", () => openMeasurement("stopMediaReadyMs", record.density, "", record.workload));
        $("landing-alerts").append(alert);
      }
      const inspect = make("button", "Inspect landing", "inspect"); inspect.type = "button";
      inspect.setAttribute("aria-label", `Inspect load and landing for ${names[record.density]} ${direction} ${constrained ? "constrained" : "ordinary"}`);
      inspect.addEventListener("click", () => openMeasurement("stopMediaReadyMs", record.density, "", record.workload));
      landing.append(inspect); row.append(landing);
      const reference = make("td", null, "pressure-reference");
      if (!pressureCaptureValid(record)) reference.append(make("p", "Invalid timing or incomplete capture", "invalid"));
      else for (const [key, label] of [["progressStruggle", "Progress"], ["frameStruggle", "Frames"]]) {
        const observed = ["early", "middle", "late"].map(prefix => record.metrics[fieldFor(key, prefix)]);
        if (observed.some(value => value?.sampleCount !== record.sampleCount || !Number.isFinite(value.p95))) reference.append(make("p", `${label}: unavailable`));
        else {
          const first = observed.findIndex(value => value.p95 > 0);
          reference.append(make("p", first < 0 ? `No ${key === "progressStruggle" ? "progress" : "frame"} breach through 200` : `${label}: ${stepLabels[first]}`));
        }
      }
      row.append(reference); $("pressure-rows").append(row);
    }
  }
  function recoveryEvidence(record) {
    const details = make("details", null, "recovery-evidence");
    details.append(make("summary", "Recovery cohort & request evidence"));
    const distribution = key => {
      const metric = record.metrics[key];
      return completeValue(record, key) === null ? `unavailable (${metric?.sampleCount ?? 0}/${record.sampleCount} observations)`
        : `median ${metric.median.toLocaleString(undefined, { maximumFractionDigits: 1 })} · upper tail ${metric.p95.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
    };
    for (const [label, ...keys] of [
      ["Cohort changed", "stopCohortChanged"], ["Post-ready stable", "postReadyCohortStable"],
      ["Data / media incomplete", "stopDataCensored", "stopMediaCensored"],
      ["Visible / decoded", "stopVisibleMediaCount", "stopDecodedMediaCount"],
      ["Failed visible media", "stopFailedMediaCount"],
      ["Request carry-in / pending", "recoveryMediaRequestsCarryIn", "recoveryMediaRequestsPending"],
      ["Completed / cancelled", "recoveryMediaRequestsCompleted", "recoveryMediaRequestCancellations"],
      ["Failures / HTTP errors", "recoveryMediaRequestFailures", "recoveryMediaHttpErrors"],
    ]) {
      details.append(make("p", `${label}: ${keys.map(distribution).join(" / ")}`, "small"));
    }
    details.append(make("p", "Independent aggregate summaries; global requests, not current-visible ownership. Joint censor-reason counts are not recorded. Upper tails of stability flags do not prove every observation passed. Upper tail is saved p95 (maximum with four repetitions).", "small muted"));
    return details;
  }
  function landingOutcome(record) {
    const limit = completeValue(record, "recoveryLimitMs");
    return `Incomplete recovery; latency withheld${limit === null ? "" : ` · observation cap ${fmt(limit, "stopMediaReadyMs")} (not latency)`}. Inspect independent cohort and request evidence.`;
  }
  function recordsComparable(entry, record, baseline, before) {
    return Boolean(environmentsComparable(entry, baseline)
      && record?.contractKey && record.contractKey === before?.contractKey
      && ["id", "scenarioRevision", "profile", "cacheClass", "completionBoundary", "resultRegime"].every(key => record[key] === before[key]));
  }
  function environmentsComparable(entry, baseline) {
    return Boolean(entry?.environmentCompatibilityKey && baseline?.environmentCompatibilityKey
      && (entry.environmentCompatibilityKey === baseline.environmentCompatibilityKey || KupuaPerfComparison.compare(entry, baseline).compatible));
  }
  function renderComparison(entry) {
    const baseline = $("baseline").value === "" ? null : entries[Number($("baseline").value)];
    const records = Object.values(entry?.metrics ?? {});
    const compatible = records.filter(record => recordsComparable(entry, record, baseline, baseline?.metrics?.[record.id]));
    $("comparison-status").textContent = baseline
      ? `${baseline.label} → ${entry.label} · ${compatible.length}/${records.length} comparable records · ${records.length - compatible.length} new or changed baselines. ${KupuaPerfComparison.compare(entry, baseline).reason}. Same contracts do not control content or cache warmth.`
      : "No earlier campaign selected. Current observations are a baseline, not a trend.";
    $("comparison-rows").replaceChildren();
    for (const record of compatible) {
      const before = baseline.metrics[record.id];
      const key = record.workload === "refresh-contention" ? "refreshMediaDeltaMs" : record.workload === "window-maintenance" ? "frameP95Ms"
        : record.scenarioRevision === 4 ? "stopMediaReadyMs" : record.metrics.mediaReadyMs ? "mediaReadyMs" : "latePendingVisibleRatioMean";
      if (!hasEvidence(record, key) && !hasEvidence(before, key)) continue;
      const current = completeValue(record, key), old = completeValue(before, key);
      const row = make("tr"), label = make("td"), link = make("button", `${names[record.density]} · ${workload[record.workload]?.[0] ?? record.id}`, "inspect"); link.type = "button";
      link.addEventListener("click", () => openMeasurement(key, record.density, key.match(/^(early|middle|late|quiet|busy|reversal|recovery)/)?.[0] ?? "", record.workload, true));
      label.append(link, make("div", infoFor(key)[0], "small muted")); row.append(label);
      row.append(make("td", fmt(old, key)), make("td", fmt(current, key)));
      const delta = current === null || old === null ? null : current - old;
      row.append(make("td", delta === null ? "Incomplete evidence" : `${fmt(delta, key, true)}${delta === 0 ? " · unchanged" : delta < 0 ? " · lower" : " · higher"}`,
        delta === null || delta === 0 ? "unchanged" : delta < 0 ? "better" : "worse"));
      $("comparison-rows").append(row);
    }
    $("comparison-rows").closest("table").hidden = !$("comparison-rows").childElementCount;
  }
  function summarizeDensity(entry, density) {
    const records = Object.values(entry?.metrics ?? {});
    const journeys = ["scroll-forward", "scroll-backward"].map(workload => records.find(record => record.density === density && record.workload === workload));
    const result = { density, journeys, scores: {}, reasons: {}, components: {}, compatibility: null };
    const valid = entry?.environmentCompatibilityKey && journeys.every(record => record
      && (record.scenarioRevision === 3 && record.profile === "density-v3-100resultsps-10s-3phases-stability" || pressureCaptureValid(record))
      && ["profile", "cacheClass", "completionBoundary", "resultRegime"].every(key => typeof record[key] === "string" && record[key])
      && (!entry.runs || record.sampleCount === entry.runs)
      && captureIs(record, "journeyCaptureRevision", 1) && captureIs(record, "journeyOverflow", 0)
      && captureIs(record, "enduranceInterrupted", 0) && (record.scenarioRevision === 4 || captureIs(record, "refillCoverageComplete", 1)));
    if (!valid) {
      for (const star of ["progress", "smoothness", "stability"]) result.reasons[star] = journeys.every(Boolean)
        ? "Incomplete or unverified capture" : "Forward/backward browsing not measured";
      return result;
    }
    result.compatibility = JSON.stringify(journeys.map(record => [record.scenarioRevision, record.workload, record.profile,
      record.cacheClass, record.completionBoundary, record.resultRegime, record.sampleCount]));
    const fractions = { progress: [], smoothness: [], stability: [] };
    const component = (star, name, fraction, record, key, phase = "") => {
      (result.components[star] ??= []).push({ name, fraction, record, key, phase });
      if (!Number.isFinite(fraction) || fraction < 0) result.reasons[star] = "Required evidence unavailable";
      else fractions[star].push(Math.min(1, fraction));
    };
    for (const record of journeys) {
      const value = key => completeValue(record, key);
      const direction = record.workload === "scroll-forward" ? "Forward" : "Backward";
      const requested = value("requestedResultsPerSecond"), achieved = value("achievedResultsPerSecond");
      if (record.scenarioRevision !== 4) component("progress", `${direction}: delivered result rate`, requested > 0 && achieved !== null ? achieved / requested : null, record, "achievedResultsPerSecond");
      if (record.scenarioRevision === 4 && (!captureIs(record, "stopDataCensored", 0) || !captureIs(record, "stopMediaCensored", 0))) result.reasons.progress = "Stopped recovery censored; inspect landing evidence";
      for (const phase of ["early", "middle", "late", ...(record.scenarioRevision === 4 && record.workload === "scroll-backward" ? ["reversal"] : [])]) {
        const read = name => value(fieldFor(name, phase));
        const pending = read("pendingVisibleRatioMean"), duration = read("drivenDurationMs"), blocked = read("bufferEdgeBlockedMs");
        const frame = read("frameP95Ms"), severe = read("severeFrameCount"), count = read("frameCount");
        const label = `${direction}, ${phase}`;
        if (record.scenarioRevision === 4) component("progress", `${label}: delivered result rate`, read("requestedResultsPerSecond") > 0
          && read("achievedResultsPerSecond") !== null ? read("achievedResultsPerSecond") / read("requestedResultsPerSecond") : null, record, "achievedResultsPerSecond", phase);
        if (!captureIs(record, fieldFor("trackingOverflow", phase), 0) || !captureIs(record, fieldFor("regionDetached", phase), 0)) {
          result.reasons.progress = result.reasons.smoothness = "Invalid phase capture";
        }
        if (!captureIs(record, fieldFor("failedCount", phase), 0) || !captureIs(record, fieldFor("missingThumbnailAreaRatioMean", phase), 0)) result.reasons.progress = "Missing or failed media needs inspection";
        component("progress", `${label}: ready slots`, pending !== null && pending >= 0 && pending <= 1 ? 1 - pending : null, record, "pendingVisibleRatioMean", phase);
        component("progress", `${label}: unblocked input`, duration > 0 && blocked !== null && blocked >= 0 && blocked <= duration ? 1 - blocked / duration : null, record, "bufferEdgeBlockedMs", phase);
        component("smoothness", `${label}: 60Hz frame reference`, frame > 0 ? (1000 / 60) / frame : null, record, "frameP95Ms", phase);
        component("smoothness", `${label}: frames exceeding 50ms`, count > 0 && severe !== null && severe >= 0 && severe <= count ? 1 - severe / count : null, record, "severeFrameCount", phase);
      }
      const displacement = value("retainedDisplacementMaxPx"), resize = value("retainedResizeMaxPx");
      const comparisons = value("retainedComparisons"), unready = value("retainedUnreadySamples");
      if (!captureIs(record, "stabilityCaptureRevision", 1) || !captureIs(record, "retainedSourceChanges", 0)) result.reasons.stability = "Source or capture changes need inspection";
      const gap = value("stabilityObservationGapMaxMs") === null ? null : record.metrics.stabilityObservationGapMaxMs.p95;
      if (gap === null || gap > 250) result.reasons.stability = gap === null ? "Sampling coverage unavailable" : "Sampling gaps exceed 250ms";
      component("stability", `${direction}: retained geometry`, displacement !== null && resize !== null && displacement >= 0 && resize >= 0
        ? 1 / (1 + Math.max(0, displacement - 1, resize - 1)) : null, record, resize > displacement ? "retainedResizeMaxPx" : "retainedDisplacementMaxPx");
      component("stability", `${direction}: retained images ready`, comparisons > 0 && unready !== null && unready >= 0 && unready <= comparisons ? 1 - unready / comparisons : null, record, "retainedUnreadySamples");
      if (record.scenarioRevision === 4 && (!captureIs(record, "stopCohortChanged", 0) || !captureIs(record, "postReadyCohortStable", 1))) result.reasons.stability = "Stopped destination changed or unavailable";
      if (record.scenarioRevision === 4 && record.workload === "scroll-backward") {
        const reverse = key => value(fieldFor(key, "reversal"));
        if (!captureIs(record, "reversalStabilityCaptureRevision", 1) || !captureIs(record, "reversalRetainedSourceChanges", 0)
          || reverse("stabilityObservationGapMaxMs") === null || record.metrics.reversalStabilityObservationGapMaxMs.p95 > 250) result.reasons.stability = "Reversal stability requires inspection";
        const displacement = reverse("retainedDisplacementMaxPx"), resize = reverse("retainedResizeMaxPx");
        component("stability", "Reversal: retained geometry", displacement !== null && resize !== null ? 1 / (1 + Math.max(0, displacement - 1, resize - 1)) : null, record, resize > displacement ? "retainedResizeMaxPx" : "retainedDisplacementMaxPx", "reversal");
        component("stability", "Reversal: retained images ready", reverse("retainedComparisons") > 0 && reverse("retainedUnreadySamples") !== null
          ? 1 - reverse("retainedUnreadySamples") / reverse("retainedComparisons") : null, record, "retainedUnreadySamples", "reversal");
      }
    }
    for (const star of Object.keys(fractions)) if (!result.reasons[star] && fractions[star].length) result.scores[star] = Math.round(1000 * Math.min(...fractions[star])) / 10;
    return result;
  }
  function openMeasurement(key, density = "", phase = "", selectedWorkload = "", history = false) {
    $("metric-search").value = ""; $("metric-focus").value = ""; $("all-metrics").checked = !keyMetrics.has(baseMetric(key));
    controls.Density.value = density; controls.Workload.value = selectedWorkload; controls.Profile.value = ""; controls.Regime.value = ""; controls.Environment.value = "";
    view = history ? "history" : "latest";
    populateMetrics();
    if ([...controls.Metric.options].some(item => item.value === baseMetric(key))) controls.Metric.value = baseMetric(key);
    populatePhases();
    if ([...$("phase").options].some(item => item.value === phase)) $("phase").value = phase;
    view = history ? "history" : "latest";
    $("latest-view").setAttribute("aria-pressed", String(!history)); $("history-view").setAttribute("aria-pressed", String(history));
    setDashboardView("measurements");
    controls.Metric.focus();
  }
  function renderOverview() {
    const entry = entries[$("campaign").value === "" ? entries.length - 1 : Number($("campaign").value)];
    renderPressure(entry);
    renderComparison(entry);
    const summaries = ["grid", "justified", "table"].map(density => summarizeDensity(entry, density));
    const labels = { progress: "Useful progress", smoothness: "Smooth movement", stability: "Stable pictures" };
    const drill = { progress: "pendingVisibleRatioMean", smoothness: "frameP95Ms", stability: "retainedDisplacementMaxPx" };
    const complete = summaries.filter(summary => Object.keys(summary.scores).length === 3).length;
    const scored = summaries.reduce((total, summary) => total + Object.keys(summary.scores).length, 0);
    $("overview-status").textContent = !entry ? "No campaign evidence yet." : scored
      ? `${complete}/3 densities have all three sampled indices. Ranks compare compatible journeys in this campaign only; medians are used, not statistical-significance claims.`
      : "Rankings unavailable: this campaign lacks complete forward/backward measurements. Available observations are shown below.";
    $("overview-scores").hidden = scored === 0;
    $("score-caution").hidden = scored === 0;
    $("overview-status").classList.toggle("overview-warning", complete < 3);
    $("overview-scores").replaceChildren(); $("overview-evidence").replaceChildren(); $("overview-observations").replaceChildren();
    const baseline = $("baseline").value === "" ? null : entries[Number($("baseline").value)];
    const earlierSummaries = baseline ? ["grid", "justified", "table"].map(density => summarizeDensity(baseline, density)) : [];
    for (const star of Object.keys(labels)) {
      const section = make("section"), list = make("ol", null, "ranking-list"); section.setAttribute("aria-label", labels[star]);
      section.append(make("h3", labels[star]), list); $("overview-scores").append(section);
      const ordered = [...summaries].sort((left, right) => (right.scores[star] ?? -1) - (left.scores[star] ?? -1));
      for (const summary of ordered) {
        const cell = make("li"); cell.id = `score-${summary.density}-${star}`;
        const score = summary.scores[star];
        cell.dataset.score = Number.isFinite(score) ? String(score) : "unavailable";
        const peers = summaries.filter(other => summary.compatibility && other.compatibility === summary.compatibility && Number.isFinite(other.scores[star]));
        const rank = peers.length > 1 && Number.isFinite(score) ? 1 + peers.filter(other => other.scores[star] > score).length : null;
        cell.dataset.rank = rank === null ? "unranked" : String(rank);
        const heading = make("div", null, "ranking-title"); heading.append(make("strong", names[summary.density]),
          make("span", rank !== null ? `${peers.filter(other => other.scores[star] === score).length > 1 ? "Joint " : ""}#${rank} of ${peers.length}` : "Not ranked", `score-rank${rank === null ? " unranked" : ""}`));
        cell.append(heading);
        const components = summary.components[star] ?? [];
        const weakest = components.filter(item => Number.isFinite(item.fraction)).sort((left, right) => left.fraction - right.fraction)[0];
        const field = weakest && fieldFor(weakest.key, weakest.phase);
        const limiting = weakest ? completeValue(weakest.record, field) : null;
        const displayValue = weakest?.key === "pendingVisibleRatioMean" && limiting !== null ? 1 - limiting : limiting;
        cell.append(make("p", summary.reasons[star] ? "Not scored" : weakest ? fmt(displayValue, field) : "Unavailable", "limiting-value"),
          make("p", summary.reasons[star] ?? `${weakest?.name ?? "No complete evidence"}${star === "stability" ? " · paint unmeasured" : ""}`, "score-note"));
        const before = earlierSummaries.find(other => other.density === summary.density);
        const matched = before && summary.compatibility && before.compatibility === summary.compatibility
          && environmentsComparable(entry, baseline);
        const delta = matched && Number.isFinite(score) && Number.isFinite(before.scores[star]) ? score - before.scores[star] : null;
        const earlierPeers = before ? earlierSummaries.filter(other => other.compatibility === before.compatibility && Number.isFinite(other.scores[star])) : [];
        const earlierRank = delta !== null && earlierPeers.length > 1 ? 1 + earlierPeers.filter(other => other.scores[star] > before.scores[star]).length : null;
        cell.append(make("span", `${Number.isFinite(score) ? `Index ${score.toLocaleString(undefined, { maximumFractionDigits: 1 })} / 100` : "Index unavailable"}${baseline ? delta === null ? " · new or incomplete baseline" : ` · ${delta > 0 ? "+" : ""}${delta.toFixed(1)} points${earlierRank === null ? "" : ` · previously #${earlierRank}`}` : ""}`, "score-number"));
        const button = make("button", "Inspect evidence", "inspect"); button.type = "button";
        button.setAttribute("aria-label", `Inspect ${labels[star].toLowerCase()} for ${names[summary.density]}`);
        button.addEventListener("click", () => openMeasurement(weakest?.key ?? drill[star], summary.density, weakest?.phase ?? "", weakest?.record.workload ?? ""));
        cell.append(button); list.append(cell);
        if (components.length) {
          const details = make("details"), table = make("table"), body = make("tbody");
          details.append(make("summary", `${names[summary.density]} · ${labels[star]} components`));
          for (const part of components) tableRow(body, [part.name, Number.isFinite(part.fraction) ? `${(100 * Math.min(1, part.fraction)).toFixed(1)} / 100` : "unavailable"]);
          table.append(body); details.append(table); $("overview-evidence").append(details);
        }
      }
    }
    for (const summary of summaries) {
      const observation = make("div"); observation.append(make("h3", names[summary.density]));
      const records = Object.values(entry?.metrics ?? {}).filter(record => record.density === summary.density);
      const observed = (key, title) => {
        const values = records.flatMap(record => [key, ...["early", "middle", "late"].map(phase => fieldFor(key, phase))]
          .map(field => ({ record, field, value: completeValue(record, field) }))).filter(item => item.value !== null);
        if (!values.length) return;
        const worst = values.sort((left, right) => right.value - left.value)[0];
        const line = make("p"), button = make("button", `${title}: ${fmt(worst.value, key)}`, "inspect"); button.type = "button";
        button.setAttribute("aria-label", `Inspect ${names[summary.density]} ${title.toLowerCase()}`);
        button.addEventListener("click", () => openMeasurement(worst.field, summary.density,
          worst.field.match(/^(early|middle|late)/)?.[0] ?? "", worst.record.workload));
        line.append(button, make("span", ` · ${workload[worst.record.workload]?.[0]?.split(" · ").at(-1) ?? worst.record.id}`, "small muted"));
        observation.append(line);
      };
      observed("frameP95Ms", "Slow-frame interval, worst phase"); observed("bufferEdgeEpisodeMaxMs", "Longest observed wall");
      observed("thumbnailVisibleWaitMaxMs", "Longest observed image wait"); observed("stabilityObservationGapMaxMs", "Largest geometry sampling gap");
      if (observation.children.length === 1) observation.append(make("p", "No usable observations in this campaign.", "muted"));
      $("overview-observations").append(observation);
    }
  }
  function setDashboardView(next) {
    dashboardView = next;
    if (next === "overview" && $("campaign").value === "" && entries.length) $("campaign").value = String(entries.length - 1);
    $("overview-panel").hidden = next !== "overview"; $("measurements-panel").hidden = next !== "measurements";
    $("overview-view").setAttribute("aria-pressed", String(next === "overview")); $("measurements-view").setAttribute("aria-pressed", String(next === "measurements"));
    render();
  }
  function render() {
    hideTooltip();
    populateMetrics();
    const key = selectedMetricKey(), info = infoFor(key);
    const campaign = entries[Number($("campaign").value)];
    const filtered = selectionRows();
    $("campaign-context").textContent = $("campaign").value === "" ? "Historical campaigns remain separate by environment and measurement contract."
      : `${friendlyEnv(campaign?.environmentCompatibilityKey)} · ${campaign?.runs ?? "Unknown"} repetitions · ${date(campaign?.timestamp)} · ${Object.keys(campaign?.metrics ?? {}).length} records${dashboardView === "measurements" && view === "history" ? " · compatible history for this campaign" : ""}`;
    renderOverview();
    $("metric-title").textContent = `${info[0]}${info[3] === "lower" ? " · lower is better" : info[3] === "lead" ? " · positive means earlier" : " · diagnostic, not a ranking"}`;
    $("metric-explanation").textContent = info[4]; $("metric-caution").textContent = info[5]; $("metric-key").textContent = key ? `Recorded field: ${key}` : "No recorded metrics";
    $("metric-position").textContent = `${Math.max(0, controls.Metric.selectedIndex + 1)} / ${controls.Metric.options.length}`;
    $("previous-metric").disabled = !controls.Metric.options.length || controls.Metric.selectedIndex <= 0;
    $("next-metric").disabled = !controls.Metric.options.length || controls.Metric.selectedIndex >= controls.Metric.options.length - 1;
    $("status").textContent = entries.length ? `${entries.length} completed campaigns · ${environments.length} environment configurations` : "No density history yet. An operator-run campaign creates density-log.js; existing histories are never substituted.";
    $("evidence").textContent = "Compare Grid and Justified within each campaign. Environments are shown separately—not a controlled direct-ES versus API experiment. One historical point is not a trend; repetitions are samples within that point.";
    const groups = new Map();
    for (const row of filtered) {
      const id = row.entry.environmentCompatibilityKey && row.record.pairedContractKey ? `${row.entry.environmentCompatibilityKey}|${row.record.pairedContractKey}` : `unverified:${row.campaign}:${row.record.id}`;
      if (!groups.has(id)) groups.set(id, []); groups.get(id).push(row);
    }
    for (const [id, group] of groups) if (!group.some(row => hasEvidence(row.record, key))) groups.delete(id);
    const cards = $("cards"); cards.replaceChildren();
    const displayed = view === "history" ? [...groups.values()].flat() : [...groups.values()].flatMap(group => group.filter(r => r.campaign === Math.max(...group.map(r => r.campaign))));
    const scales = new Map([...new Set(displayed.map(row => row.record.workload))].map(key =>
      [key, scaleFor(displayed.filter(row => row.record.workload === key))]));
    const sorted = [...groups.values()].sort((a, b) => (parseInt(a[0].record.id.slice(1)) - parseInt(b[0].record.id.slice(1))) || friendlyEnv(a[0].entry.environmentCompatibilityKey).localeCompare(friendlyEnv(b[0].entry.environmentCompatibilityKey)));
    for (const group of sorted) {
      const latestIndex = Math.max(...group.map(r => r.campaign));
      const latest = group.filter(r => r.campaign === latestIndex), first = latest[0], r = first.record;
      const card = make("section", null, "card"); card.setAttribute("aria-label", `${workload[r.workload]?.[0] ?? r.workload} · ${friendlyEnv(first.entry.environmentCompatibilityKey)}`);
      const context = make("div", null, "context"); context.append(make("strong", friendlyEnv(first.entry.environmentCompatibilityKey)), make("span", profileName(r.profile), `badge${r.workload === "scroll-constrained" ? " stress" : ""}`));
      card.append(context, make("h3", workload[r.workload]?.[0] ?? r.workload), make("p", workload[r.workload]?.[1] ?? r.workload, "small muted"), make("p", `${date(first.entry.timestamp)} · ${r.sampleCount} repetitions · ${r.resultRegime} · r${r.scenarioRevision}`, "small muted"));
      const scale = scales.get(r.workload);
      const observations = view === "latest" ? latest : group;
      const baseline = $("baseline").value === "" ? null : entries[Number($("baseline").value)];
      if (baseline) for (const row of latest.filter(row => row.entry === campaign)) {
        const before = baseline.metrics?.[row.record.id];
        const comparable = recordsComparable(campaign, row.record, baseline, before);
        const currentValue = completeValue(row.record, key) === null ? null : row.record.metrics[key][controls.Statistic.value];
        const beforeValue = !comparable || completeValue(before, key) === null ? null : before.metrics[key][controls.Statistic.value];
        card.append(make("p", `${names[row.record.density]} vs ${baseline.label}: ${!comparable ? "no comparable evidence"
          : currentValue === null || beforeValue === null ? "measurement incomplete"
          : `${fmt(beforeValue)} → ${fmt(currentValue)} · ${fmt(currentValue - beforeValue, key, true)}`}`, "selected-comparison"));
      }
      if (observations.some(row => Number.isFinite(valueOf(row)))) {
        if (view === "latest") drawLatest(card, latest, scale); else drawHistory(card, group, scale);
      }
      for (const row of observations.filter(row => !Number.isFinite(valueOf(row)))) {
        const metric = row.record.metrics[key];
        card.append(make("p", `${names[row.record.density]} · ${row.entry.label}: ${metric?.sampleCount ?? 0}/${row.record.sampleCount} observed · ${key === "stopMediaReadyMs" ? landingOutcome(row.record) : "Completion unavailable; inspect censoring and coverage"}`, "outcome-row"));
      }
      const grid = latest.find(r => r.record.density === "grid"), justified = latest.find(r => r.record.density === "justified");
      const pair = first.entry.pairs?.find(pair => pair.controlId === grid?.record.id && pair.candidateId === justified?.record.id && pair.contractKey === grid?.record.pairedContractKey);
      if (first.entry.environmentCompatibilityKey && pair && grid?.record.pairedContractKey === justified?.record.pairedContractKey) {
        const a = valueOf(grid, "median"), b = valueOf(justified, "median");
        card.append(make("p", Number.isFinite(a) && Number.isFinite(b) ? `Justified − Grid median: ${fmt(b - a, key, true)} · descriptive difference` : "Matched difference unavailable: incomplete samples.", "delta"));
      }
      const details = make("details"); details.append(make("summary", "Campaign & measurement contract"), make("p", first.entry.label), make("p", `Cache: ${r.cacheClass}`), make("p", `Completion: ${r.completionBoundary}`), make("p", `Profile: ${r.profile}`), make("p", `Source: ${first.entry.gitSha ?? "unknown"}${first.entry.gitDirty ? " (dirty)" : ""} · ${first.entry.environment?.appSourceDirtyStateHash ?? "unverified"}`));
      card.append(details); cards.append(card);
    }
    if (!groups.size) cards.append(make("p", "No records for this metric and selection. Change the metric or clear advanced filters.", "empty"));
    $("card-status").textContent = `${groups.size} comparison cards · ${view === "latest" ? "latest campaign per compatible group" : "compatible history only"} · shared scale within each workload · ${controls.Statistic.value === "median" ? "median of repetitions" : "p95 of repetitions (maximum when n=4)"}`;
    const table = $("measurements"); table.replaceChildren();
    for (const row of displayed) { const value = row.record.metrics[key]; tableRow(table, [`${row.entry.label} · ${date(row.entry.timestamp)} · ${row.entry.gitSha ?? "unknown"}`, row.record.id, `${friendlyEnv(row.entry.environmentCompatibilityKey)} · ${row.record.resultRegime} · r${row.record.scenarioRevision}`, fmt(value?.median), fmt(value?.p95), `${value?.sampleCount ?? 0}/${row.record.sampleCount}`]); }
    const pairs = $("pairs"); pairs.replaceChildren();
    for (const entry of entries) for (const pair of entry.pairs ?? []) {
      const candidate = entry.metrics[pair.candidateId], control = entry.metrics[pair.controlId];
      if (!candidate || !control || !entry.environmentCompatibilityKey || candidate.density !== "justified" || control.density !== "grid" || !candidate.pairedContractKey || candidate.pairedContractKey !== control.pairedContractKey || candidate.pairedContractKey !== pair.contractKey || !displayed.some(row => row.entry === entry && [candidate.id, control.id].includes(row.record.id))) continue;
      const a = control.metrics[key]?.median, b = candidate.metrics[key]?.median;
      tableRow(pairs, [entry.label, `${control.id} ↔ ${candidate.id}`, info[0], Number.isFinite(a) && Number.isFinite(b) ? fmt(b - a, key, true) : "unavailable", `${control.sampleCount} Grid / ${candidate.sampleCount} Justified observations; difference of matched-layout medians, not within-repetition deltas; descriptive only`]);
    }
    if (!pairs.childElementCount) tableRow(pairs, ["No compatible pairs for this selection", "", "", "", ""]);
  }
  function cycle(direction) {
    const select = controls.Metric; if (!select.options.length) return;
    select.selectedIndex = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + direction));
    populatePhases();
    render();
  }
  $("previous-metric").addEventListener("click", () => cycle(-1)); $("next-metric").addEventListener("click", () => cycle(1));
  controls.Metric.addEventListener("change", () => { populatePhases(); render(); }); controls.Environment.addEventListener("change", render);
  $("phase").addEventListener("change", render);
  $("metric-focus").addEventListener("change", () => { populateMetrics(); render(); });
  $("metric-search").addEventListener("input", () => { populateMetrics(); render(); });
  $("campaign").addEventListener("change", () => { populateBaselines(); if (dashboardView === "overview" && $("campaign").value === "") setDashboardView("measurements"); else render(); });
  $("baseline").addEventListener("change", render);
  $("overview-view").addEventListener("click", () => setDashboardView("overview"));
  $("measurements-view").addEventListener("click", () => setDashboardView("measurements"));
  $("all-metrics").addEventListener("change", () => { populateMetrics(); render(); });
  for (const choice of ["latest", "history"]) $(`${choice}-view`).addEventListener("click", () => { view = choice; for (const v of ["latest", "history"]) $(`${v}-view`).setAttribute("aria-pressed", String(v === view)); render(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") { hideTooltip(); return; }
    if (dashboardView !== "measurements") return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target?.isContentEditable || event.target?.closest?.("input,select,textarea,[contenteditable=true]")) return;
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); cycle(event.key === "ArrowLeft" ? -1 : 1); }
  });
  document.addEventListener("pointerdown", event => { if (!event.target?.closest?.(".mark")) hideTooltip(); });
  window.addEventListener("scroll", () => {
    if (!tooltipTarget || tooltip.hidden) return;
    const box = tooltipTarget.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight) { hideTooltip(); return; }
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - tooltip.offsetWidth - 8, box.right + 12))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(innerHeight - tooltip.offsetHeight - 8, box.top + 14))}px`;
  }, { passive: true });
  window.addEventListener("resize", hideTooltip);
  render();
})();
