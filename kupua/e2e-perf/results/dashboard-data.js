"use strict";
(() => {
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
  const members = Object.freeze({ audit: "2026-10-24T08:30:42.035Z", short: "2026-10-24T08:33:51.333Z", long: "2026-10-24T08:36:16.196Z", density: "2026-10-24T08:49:53.477Z" });
  const scenarios = {
    rendering: ["P1","P2","P3","P3b","P4a","P4b","P5a","P5b","P5c","P6","P7","P8","P9","P11@20","P11@60","P11@85","P11b@20","P11b@60","P11b@85","P13a","P13b","P13c","P14a","P14b","P14c","P14d","P15a","P15b","P15c","P16a","P16b","P17","P18","P19"],
    short: ["PP1","PP2","PP3","PP4","PP5","PP6","PP6b","PP6c","PP7","PP7b","PP7c","PP8","PP9","PP10","PP11"],
    long: ["JA1","JA2","JA3","JB1","JB2","JB3","JB4","JB5"],
    density: ["D1-grid","D1-justified","D1-table","D2-grid","D2-justified","D2-table","D3-grid","D3-justified","D4-grid","D4-justified","D5-grid","D5-justified","D6-grid","D6-justified","D7-grid","D7-justified","D8-grid","D8-justified","D8-table","D11-grid","D11-justified"]
  };
  const definitions = [{ id: "recorded", name: "Recorded · canonical images · 24 Oct", synthetic: false,
    note: "Explicit four-entry M5 checkpoint. Laptop development app, not hosted M6. Source fingerprints do not cover untracked contents; content/cache warmth is uncontrolled.",
    members: [
      { family: "audit", kind: "rendering", timestamp: members.audit, expected: 34, scenarios: scenarios.rendering },
      { family: "perceived", kind: "short", timestamp: members.short, expected: 15, scenarios: scenarios.short },
      { family: "perceived", kind: "long", timestamp: members.long, expected: 8, scenarios: scenarios.long },
      { family: "density", kind: "density", timestamp: members.density, expected: 21, scenarios: scenarios.density }
    ] }, {
    id: "proxy-baseline", name: "Proxy baseline · assembled 23–24 Oct", synthetic: false,
    note: "Operator-confirmed assembly of three separately executed deployment checkpoints, not one atomic campaign. Long responsiveness is explicitly absent; no older long run is borrowed. Source fingerprints differ from the canonical checkpoint; content/cache warmth is uncontrolled. C−B deltas are descriptive, not isolated delivery effects.",
    absentFamilies: ["Long responsiveness"],
    members: [
      { family: "audit", kind: "rendering", timestamp: "2026-10-24T00:14:11.263Z", expected: 34, scenarios: scenarios.rendering },
      { family: "perceived", kind: "short", timestamp: "2026-10-23T23:29:50.826Z", expected: 15, scenarios: scenarios.short },
      { family: "density", kind: "density", timestamp: "2026-10-24T04:32:34.673Z", expected: 21, scenarios: scenarios.density }
    ]
  }];
  const descriptions = {
    P13a: ["Open resident detail · frame evidence", "images", "Detail entry", "p95Frame"],
    P13b: ["Return to list · signed focus displacement", "images", "Detail entry", "focusDriftPx"],
    P13c: ["Open detail · returned media", "images", "Detail entry", "detailImageReadyMs"],
    P14a: ["Traverse · normal forward", "images", "Traversal", "landingRenderMs"],
    P14b: ["Traverse · fast forward", "images", "Traversal", "landingRenderMs"],
    P14c: ["Traverse · fast backward", "images", "Traversal", "landingRenderMs"],
    P14d: ["Traverse · rapid forward", "images", "Traversal", "landingRenderMs"],
    PP3: ["Sort around the focused image", "search", "Search / sort", "dt_visual_settled_ms"],
    PP7: ["Seek · click near the middle", "search", "Arbitrary-position access", "dt_visual_settled_ms"],
    JA2: ["Open detail · loaded & stable", "images", "Detail entry", "dt_visual_settled_ms"],
    JB5: ["Native fullscreen return", "images", "Fullscreen return", "dt_visual_settled_ms"]
  };
  const searchGroups = {
    startup: ["JA1", "JB1", "P1"],
    actions: ["PP1", "PP2", "PP3", "PP4", "PP5", "PP8", "PP9", "JA3", "JB2", "JB3", "P6", "P9"],
    seeking: ["PP7", "PP7b", "PP7c", "JB4", "D5-grid", "D5-justified", "P3", "P3b", "P7"],
    restore: ["PP11"], refresh: ["D11-grid", "D11-justified"], background: ["PP10"]
  };
  const searchTitles = {
    P1: "Initial navigation · first-render diagnostics", JA1: "Cold navigation · buffer", JB1: "Cold navigation · indexed",
    PP1: "Home · return to unpinned top", PP2: "Sort without focus · Uploaded to Width", PP3: "Sort around the focused image · Credit",
    PP4: "Toggle sort direction · preserve focus", PP5: "Toggle free-to-use filter", PP8: "Search after CQL debounce",
    PP9: "Remove CQL chip · preserve anchor", JA3: "Search from metadata · colour model", JB2: "Include subject facet", JB3: "Exclude colour-profile facet",
    P6: "Sort · signed focus displacement", P9: "Search · frame diagnostics",
    PP7: "Seek · click near the middle", PP7b: "Seek · drag release", PP7c: "Scrubber · in-buffer scroll", JB4: "Scrubber · indexed scroll",
    P3: "Seek click · frame diagnostics", P3b: "Seek drag · frame diagnostics", P7: "Drag · movement before release",
    PP11: "History Back · restore deep focused anchor", PP10: "Position-map publication · background diagnostic"
  };
  const searchGroup = record => Object.keys(searchGroups).find(group => searchGroups[group].includes(record?.scenario)) ?? null;
  function describeSearch(scenario, raw) {
    const group = searchGroup({ scenario });
    if (!group) return null;
    const density = scenario.startsWith("D"), rendering = /^P\d/.test(scenario);
    const primary = group === "background" ? "dt_store_ready_ms" : group === "refresh" ? "refreshMediaDeltaMs"
      : density ? "placementMs" : rendering ? scenario === "P6" ? "focusDriftPx" : "p95Frame" : "dt_visual_settled_ms";
    return { title: searchTitles[scenario] ?? `${group === "seeking" ? "Seek placement and visible decode" : "Same-query paired refresh"} · ${raw.density}`,
      area: "search", workflow: { startup: "Startup", actions: "Query actions", seeking: "Arbitrary-position access", restore: "Restoration", refresh: "Paired refresh", background: "Background diagnostics" }[group],
      primary, ...(group === "background" ? { metricClass: "background-diagnostic" } : {}), unit: primary.endsWith("Px") ? "px" : "ms",
      boundary: raw.completionBoundary ?? (group === "background" ? "Background position-map publication; no foreground completion boundary."
        : rendering ? "Rendering diagnostics for the action; not action readiness." : "Owned action phases share a start clock; do not add them."),
      limit: group === "refresh" ? "Saved active-minus-drained deltas are paired within each repetition, never arm-median subtraction. Isolation and media censoring are separate; valid overlap is not causal attribution."
        : group === "background" ? "Store-ready and map entry count only. No foreground completion, target band or readiness grade."
          : ["PP3", "PP4"].includes(scenario) ? "Timings describe healthy samples only; degraded fallback is not preservation. Optional status correlation remains unresolved."
            : ["PP9", "PP11"].includes(scenario) ? "Preservation guards are recorded evidence, not displaced-anchor detector certification. PP9 belongs to query actions with a restoration cross-link."
              : rendering ? "Complementary frame/geometry evidence, not the responsiveness clock; no numeric pooling."
                : "Published action phases, not explicit paint. Optional status correlation and long-action store/route diagnostic freshness remain unresolved." };
  }
  function describe(scenario, raw) {
    const search = describeSearch(scenario, raw);
    if (search) return search;
    const mapped = /^D(?:5|11)-/.test(scenario) ? [`${raw.workload} · ${raw.density}`, "search", scenario.startsWith("D5") ? "Arbitrary-position access" : "Refresh", scenario.startsWith("D5") ? "placementMs" : "refreshMediaDeltaMs"]
      : /^D4-/.test(scenario) ? [`${raw.workload} · ${raw.density}`, "images", "Detail entry", "placementMs"]
        : /^(?:P2|P8|P17)$/.test(scenario) ? [raw.label ?? scenario, "scroll", "Browsing", "p95Frame"]
          : /^(?:P4[ab]|P11b?@\d+|P16[ab]|PP6[bc]?)$/.test(scenario) ? [raw.label ?? scenario, "scroll", "Transitions & Maintenance", scenario.startsWith("PP") ? "dt_visual_settled_ms" : "p95Frame"] : null;
    const fallback = scenario.startsWith("D")
      ? [`${raw.workload} · ${raw.density}`, "scroll", "Scrolling", "middleFrameP95Ms"]
      : /^(P5|P15|P18|P19)/.test(scenario)
        ? [scenario, "images", /P18|P19|P5/.test(scenario) ? "Selection & panels" : "Fullscreen return", "selectionVisualSettledMs"]
        : [raw.label ?? scenario, "search", "Search / sort", "dt_visual_settled_ms"];
    const [title, area, workflow, primary] = mapped ?? descriptions[scenario] ?? fallback;
    const selected = scenario === "D8-table" ? "stopMediaReadyMs" : scenario === "JB5" && own(raw,"anchorDriftPx") ? "anchorDriftPx" : primary;
    const existing = descriptions[scenario] || own(raw, selected) || own(raw.metrics, selected) ? selected
      : ["p95Frame", "placementReadyMs", "frameP95Ms", ...Object.keys(raw.metrics ?? {})].find(field => own(raw, field) || own(raw.metrics, field));
    return { title, area, workflow, primary: existing, unit: existing?.endsWith("Px") ? "px" : /Ms$|_ms$|^p95Frame$/.test(existing) ? "ms" : "",
      boundary: raw.completionBoundary ?? (scenario.startsWith("P14") ? "Final committed navigation, observed after the final cadence; loaded within cadence is separate." : scenario === "JA2" ? "Double-click to loaded image and stable geometry, not explicit decode." : "See the preserved record contract and measurement reference."),
      limit: scenario.startsWith("P14") ? "U1/U2 remain open: limited landing clock and resource/cache inference. No verified cache hit, decode or paint claim."
        : scenario === "P13c" ? "Singleton, metadata and decoded/stable returned media have separate overlapping clocks. Returned media is not guaranteed warm. URL reuse is not a cache-hit test."
          : scenario.startsWith("D") ? "Sampled forward step is not the full density index. Geometry and loaded images do not certify paint. Incomplete endpoints retain null latency."
            : "Published aggregates, not reconstructed trials. Loaded/stable is not an explicit decode or paint oracle; no population-tail or causal claim." };
  }
  function read(record, field) {
    if (!record) return null;
    return own(record.raw.metrics, field) ? record.raw.metrics[field]?.median ?? null : record.raw[field] ?? null;
  }
  function completion(record) {
    const raw = record.raw;
    if (record.scenario === "PP10") return null;
    if (record.scenario.startsWith("P14") && own(raw, "landingRenderedCount")) return { ready: raw.landingRenderedCount, unavailable: raw.landingCensoredCount, total: raw.sampleCount };
    if (record.scenario === "P13c" && own(raw, "detailImageReadyCount")) return { ready: raw.detailImageReadyCount, unavailable: raw.detailImageCensoredCount, total: raw.sampleCount };
    if (raw.metrics?.stopMediaReadyMs) return { ready: raw.metrics.stopMediaReadyMs.sampleCount, unavailable: raw.metrics.stopMediaReadyMs.unavailableCount, total: raw.sampleCount };
    if (["PP3", "PP4"].includes(record.scenario) || own(raw, "degradedCount")) {
      const degraded = own(raw, "degradedCount") ? raw.degradedCount : 0;
      return { ready: raw.sampleCount, unavailable: degraded, total: raw.sampleCount + degraded };
    }
    return null;
  }
  function population(record, field) {
    const raw = record.raw, metric = raw.metrics?.[field], outcomes = completion(record);
    const status = fieldStatus(record, field);
    if (["invalid", "unsupported", "absent"].includes(status.state)) return { state: status.state, available: status.state === "unsupported" ? 0 : null, unavailable: null, total: raw.sampleCount ?? null };
    if (metric) return { state: status.state, available: metric.sampleCount ?? null, unavailable: metric.unavailableCount ?? null, total: raw.sampleCount ?? null };
    if (status.state === "unavailable" && raw.sampleCount === 0) return { state: "unavailable", available: 0, unavailable: outcomes?.unavailable ?? null, total: outcomes?.total ?? 0 };
    const completedOnly = field === "detailImageReadyMs" || field === "landingRenderMs" || field === "landingNetworkMs" || /dt_(first_visible_frame|visual_settled).*ms/.test(field);
    const available = completedOnly && outcomes ? outcomes.ready : finite(raw[field]) || typeof raw[field] === "boolean" ? raw.sampleCount ?? null : null;
    return { state: raw[field] === null ? "null" : "available", available, unavailable: completedOnly && outcomes ? outcomes.unavailable : null, total: outcomes?.total ?? raw.sampleCount ?? null };
  }
  function validity(record) {
    const raw = record.raw, outcomes = completion(record);
    return raw.captureValid !== false && raw.measurementValid !== false && raw.invalid !== true
      && Number.isInteger(raw.sampleCount) && raw.sampleCount >= 0
      && (!outcomes || [outcomes.ready, outcomes.unavailable, outcomes.total].every(count => Number.isInteger(count) && count >= 0)
        && outcomes.ready + outcomes.unavailable === outcomes.total)
      && pressureCaptureValid(record);
  }
  function completeValue(raw, field) {
    const metric = raw.metrics?.[field];
    return Number.isInteger(raw.sampleCount) && raw.sampleCount > 0 && metric?.sampleCount === raw.sampleCount
      && metric.unavailableCount === 0 && finite(metric.median) && finite(metric.p95) ? metric.median : null;
  }
  function captureIs(raw, field, expected) {
    return completeValue(raw, field) === expected && raw.metrics[field].p95 === expected;
  }
  function pressureCaptureValid(record) {
    const raw = record.raw;
    if (record.family !== "density" || !["scroll-forward", "scroll-backward", "scroll-constrained"].includes(raw.workload)) return true;
    if (raw.scenarioRevision === 3) return raw.profile === "density-v3-100resultsps-10s-3phases-stability"
      && captureIs(raw, "journeyCaptureRevision", 1) && captureIs(raw, "journeyOverflow", 0)
      && captureIs(raw, "enduranceInterrupted", 0) && captureIs(raw, "refillCoverageComplete", 1);
    return raw.scenarioRevision === 4 && raw.profile?.startsWith("density-v4-30-100-200resultsps")
      && captureIs(raw, "journeyCaptureRevision", 1) && captureIs(raw, "journeyOverflow", 0)
      && captureIs(raw, "enduranceInterrupted", 0) && captureIs(raw, "pressureCaptureRevision", 1)
      && captureIs(raw, "timingCaptureRevision", 2) && captureIs(raw, "requestWindowCaptureRevision", 1)
      && captureIs(raw, "requestClockMissingCount", 0)
      && ["observerStopLagMs", "recoveryStartLagMs"].every(field => completeValue(raw, field) !== null && raw.metrics[field].p95 <= 25)
      && ["early", "middle", "late"].every((phase, index) => captureIs(raw, `${phase}RequestedResultsPerSecond`, [30, 100, 200][index])
        && captureIs(raw, `${phase}RequestWindowCaptureRevision`, 1) && captureIs(raw, `${phase}RequestClockMissingCount`, 0));
  }
  const phaseField = (base, phase = "") => phase && base ? phase + base[0].toUpperCase() + base.slice(1) : base;
  const baseField = field => field.replace(/^(early|middle|late|quiet|busy|reversal|recovery)([A-Z])/, (_match, _phase, letter) => letter.toLowerCase());
  const fieldPhase = field => field === baseField(field) ? "" : field.match(/^(early|middle|late|quiet|busy|reversal|recovery)/)[0];
  const pairedRefresh = field => /^refresh(?:Data|Placement|Media)DeltaMs$/.test(field);
  function refreshCaptureStatus(record) {
    const raw = record?.raw;
    if (!raw) return { state: "absent", reason: "Record absent" };
    if (!validity(record)) return { state: "invalid", reason: "Invalid capture or outcome counts" };
    if (raw.supported === false) return { state: "unsupported", reason: "Unsupported measurement" };
    for (const arm of ["quiet", "busy"]) {
      if (!captureIs(raw, `${arm}RequestCaptureRevision`, 1) || !captureIs(raw, `${arm}RequestTimingCaptureRevision`, 1))
        return { state: "unsupported", reason: "Paired request capture support unavailable" };
      if (!captureIs(raw, `${arm}RequestCaptureOverflow`, 0)) return { state: "invalid", reason: "Invalid paired request capture / overflow" };
    }
    return { state: "available", reason: "Recorded paired request capture" };
  }
  function refreshPairStatus(record, field) {
    const capture = refreshCaptureStatus(record), raw = record.raw;
    if (capture.state !== "available") return capture;
    const positive = key => completeValue(raw, key) > 0 && raw.metrics[key].p95 > 0;
    const isolated = captureIs(raw, "refreshComparisonCensored", 0)
      && ["quietMediaPendingAtDispatch", "quietDataPendingAtDispatch", "busyDataPendingAtDispatch", "quietPrimingMediaCensored",
        "quietDataHttpErrors", "busyDataHttpErrors", "quietDataRequestFailures", "busyDataRequestFailures"].every(key => captureIs(raw, key, 0))
      && ["busyMediaPendingAtDispatch", "quietDataRequestStarts", "busyDataRequestStarts"].every(positive);
    if (!isolated) return { state: "unavailable", reason: "Paired isolation censored or unavailable; arm timings remain separate evidence" };
    if (field === "refreshMediaDeltaMs" && !["quietMediaCensored", "busyMediaCensored"].every(key => captureIs(raw, key, 0)))
      return { state: "unavailable", reason: "Paired media endpoint censored or unavailable; isolation is separate" };
    return { state: "available", reason: "Recorded within-repetition paired delta" };
  }
  function refreshOutcomes(record, field) {
    const empty = (state, reason) => ({ state, available: null, unavailable: null, total: null, reason });
    if (!pairedRefresh(field)) return empty("absent", "Not a saved paired-delta field");
    const capture = refreshCaptureStatus(record);
    if (capture.state !== "available") return empty(capture.state, capture.reason);
    const raw = record.raw, metric = raw.metrics?.[field];
    if (!metric) return empty("absent", "Paired-delta field absent");
    if (![metric.sampleCount, metric.unavailableCount].every(count => Number.isInteger(count) && count >= 0)
      || metric.sampleCount + metric.unavailableCount !== raw.sampleCount) return empty("invalid", "Inconsistent paired contributor counts");
    const pair = refreshPairStatus(record, field);
    const state = metric.sampleCount === 0 ? "unavailable" : metric.unavailableCount > 0 ? "partial" : pair.state;
    return { state, available: metric.sampleCount, unavailable: metric.unavailableCount, total: raw.sampleCount,
      reason: pair.state === "available" ? metric.unavailableCount > 0 ? "Partial paired contributors; numeric assessment withheld" : "Recorded paired contributors"
        : pair.reason };
  }
  function fieldStatus(record, field) {
    const raw = record?.raw;
    const status = (state, reason) => ({ state, reason });
    if (!raw) return status("absent", "Record absent");
    if (!validity(record)) return status("invalid", "Invalid capture or outcome counts");
    if (raw.supported === false) return status("unsupported", "Unsupported measurement");
    if (!own(raw, field) && !own(raw.metrics, field)) return status("absent", "Field absent");
    const metric = raw.metrics?.[field], base = baseField(field), phase = fieldPhase(field);
    if (record.scenario === "PP10" && !["dt_store_ready_ms", "dt_store_ready_p95_ms", "mapEntryCount"].includes(field))
      return status("unsupported", "Background diagnostic; foreground phases and completion are inapplicable");
    if (/^(?:PP|JA|JB)/.test(record.scenario) && raw.sampleCount === 0
      && /(?:_ms$|Ms$|^(?:took|fetchDuration|seekTime|aggTook|aggFetchDuration)$)/.test(field))
      return status("unavailable", "No healthy timing contributors; degraded outcomes add no timings");
    if (metric && (![metric.sampleCount, metric.unavailableCount].every(count => Number.isInteger(count) && count >= 0)
      || metric.sampleCount + metric.unavailableCount !== raw.sampleCount)) return status("invalid", "Inconsistent field population");
    if (record.family === "density") {
      if (/^D11-/.test(record.scenario) && pairedRefresh(field)) {
        const pair = refreshPairStatus(record, field);
        if (pair.state !== "available") return status(pair.state === "unavailable" && metric?.sampleCount > 0
          && metric.sampleCount < raw.sampleCount ? "partial" : pair.state, pair.reason);
      }
      if (/^D11-/.test(record.scenario) && /^(quiet|busy)MediaReadyMs$/.test(field)
        && !captureIs(raw, field.replace("MediaReadyMs", "MediaCensored"), 0)) return status("unavailable", "Arm media endpoint censored or unavailable");
      const key = name => phaseField(name, phase);
      const complete = name => completeValue(raw, key(name));
      const is = (name, expected) => captureIs(raw, key(name), expected);
      const positive = name => complete(name) > 0 && raw.metrics[key(name)].p95 > 0;
      // A failed observer scope cannot qualify any measurement from that phase.
      const scoped = ["trackingOverflow", "regionDetached"].filter(name => own(raw.metrics, key(name)));
      if (scoped.some(name => !is(name, 0)) || ["early", "middle", "late", "reversal"].includes(phase)
        && (!is("trackingOverflow", 0) || !is("regionDetached", 0))) return status("invalid", "Invalid phase capture");
      if (phase === "reversal" && (!is("journeyCaptureRevision", 1) || !is("journeyOverflow", 0)
        || raw.scenarioRevision === 4 && (!is("requestWindowCaptureRevision", 1) || !is("requestClockMissingCount", 0)))) return status("invalid", "Invalid reversal capture");
      if (raw.workload === "window-maintenance" && (raw.geometryScope !== "loaded-window"
        || !(completeValue(raw, "evictionCount") >= 1) || !(raw.metrics.evictionCount.p95 >= 1)
        || !(completeValue(raw, "prependCount") >= 0) || !(raw.metrics.prependCount.p95 >= 0))) return status("invalid", "Unverified loaded-window maintenance / eviction");
      if (/^(?:frame|severeFrame)/.test(base) && (!positive("frameCount") || !positive("frameSampleCount"))) return status("invalid", "Frame population unavailable");
      if (/^(?:layoutShift|thumbnailShift)/.test(base) && base !== "layoutShiftSupported" && !is("layoutShiftSupported", 1)) return status("unsupported", "Layout-shift capture unsupported or unavailable");
      if (/^paint/.test(base) && base !== "paintCaptureAvailable" && !is("paintCaptureAvailable", 1)) return status("unsupported", "Paint not captured; DOM geometry is not paint evidence");
      if (/^retained(?:Displacement|Resize|Unready)/.test(base)) {
        if (!is("stabilityCaptureRevision", 1) || !is("retainedSourceChanges", 0) || !positive("retainedComparisons")
          || !(complete("stabilityObservationGapMaxMs") >= 0) || complete("stabilityObservationGapMaxMs") === null
          || raw.metrics[key("stabilityObservationGapMaxMs")].p95 < 0 || raw.metrics[key("stabilityObservationGapMaxMs")].p95 > 250)
          return status("invalid", "Sampled geometry/source/coverage invalid or unavailable");
        if (metric && [metric.median, metric.p95].some(value => value !== null && (!finite(value) || value < 0))) return status("invalid", "Invalid sampled geometry");
        if (base === "retainedUnreadySamples" && metric && ["median", "p95"].some(stat => metric[stat] > raw.metrics[key("retainedComparisons")][stat])) return status("invalid", "Inconsistent sampled readiness population");
      }
      if (metric && [metric.median, metric.p95].some(value => value != null && (!finite(value)
        || value < 0 && !/readinessLeadPx/i.test(base) && !/^refresh(?:Data|Placement|Media)DeltaMs$/.test(base)
        || /Ratio/.test(base) && value > 1))) return status("invalid", "Invalid field magnitude");
    }
    if (metric) {
      if (![metric.sampleCount, metric.unavailableCount].every(count => Number.isInteger(count) && count >= 0)
        || metric.sampleCount + metric.unavailableCount !== raw.sampleCount) return status("invalid", "Inconsistent field population");
      if (metric.sampleCount > 0 && metric.sampleCount < raw.sampleCount) return status("partial", "Partial field population; numeric assessment withheld");
      if (metric.median === null || metric.sampleCount === 0) return status("unavailable", "Endpoint unavailable / censored");
      if (!finite(metric.median) || !finite(metric.p95)) return status("invalid", "Incomplete median/p95 evidence");
    } else if (raw[field] === null) return status("null", "Recorded null");
    return status("available", "Available");
  }
  function measure(record, field) {
    if (fieldStatus(record, field).state !== "available") return null;
    const raw = record.raw, metric = raw.metrics?.[field];
    if (metric) return completeValue(raw, field);
    return read(record, field);
  }
  function statistic(record, field) {
    const metric = record?.raw.metrics?.[field];
    return metric && (measure(record, field) === null ? { ...metric, median: null, p95: null } : metric);
  }
  function tailLabel(record, field) {
    const count = population(record, field).available;
    return count > 0 && count < 20 ? "Observed maximum" : "Recorded p95";
  }
  function recordPair(record, before, entry, baseline, field = record.primary) {
    if (!record || !before) return { ok: false, reason: "Selected checkpoint has no matching record. No older observation is substituted." };
    if (record.synthetic !== before.synthetic) return { ok: false, reason: "Recorded and synthetic evidence cannot be compared." };
    const environment = globalThis.KupuaPerfComparison.compare(entry, baseline);
    if (!environment.compatible) return { ok: false, reason: environment.reason };
    if (record.scenario !== before.scenario || record.kind !== before.kind || record.family !== before.family) return { ok: false, reason: "Different owning family, kind or scenario." };
    const fields = ["scenarioRevision", "cacheClass", "completionBoundary", "resultRegime", "routes", "lookupGuardRevision", "profile", "workload", "density", "cadenceMs", "direction", "startRank", "traversals", "committedSteps", "detailObservationLimitMs"];
    if (record.family === "density") fields.push("contractKey", "pairedContractKey");
    if (field.startsWith("network")) fields.push("networkCaptureRevision", "networkTransport");
    const mismatches = fields.filter(key => JSON.stringify(record.raw[key] ?? null) !== JSON.stringify(before.raw[key] ?? null));
    if (record.raw.scenarioRevision == null || record.family === "density" && !record.raw.contractKey) mismatches.push("unverified contract");
    if (field.startsWith("network") && entry.environment?.apiTopology !== baseline.environment?.apiTopology) mismatches.push("network topology");
    if (mismatches.length) return { ok: false, reason: `Contract mismatch: ${mismatches.join(", ")}.` };
    if (record.raw.supported === false || before.raw.supported === false) return { ok: false, reason: "Unsupported measurement." };
    if (!validity(record) || !validity(before)) return { ok: false, reason: "Invalid capture or outcome counts." };
    for (const candidate of [record, before]) {
      const status = fieldStatus(candidate, field);
      if (["invalid", "unsupported", "absent", "partial"].includes(status.state)
        || status.state === "unavailable" && (pairedRefresh(field) || /^(?:PP|JA|JB)/.test(candidate.scenario) && candidate.raw.sampleCount === 0))
        return { ok: false, reason: `${status.reason}; numeric comparison withheld.` };
      const metric = candidate.raw.metrics?.[field];
      if (metric && (metric.sampleCount + metric.unavailableCount !== candidate.raw.sampleCount
        || finite(metric.median) && completeValue(candidate.raw, field) === null)) return { ok: false, reason: "Incomplete or inconsistent field population; numeric comparison withheld." };
    }
    return { ok: true, b: before, reason: `${environment.reason}; matched record contract; descriptive difference only.` };
  }
  function build(histories, registry = definitions) {
    const records = {}, entries = {}, checkpoints = {};
    for (const definition of registry) {
      const checkpoint = { ...definition, members: [], missing: [], planned: 0, completed: 0, profile: "Explicit checkpoint membership" };
      for (const member of definition.members) {
        checkpoint.planned += member.expected;
        const candidates = (histories[member.family]?.entries ?? []).filter(entry => entry.timestamp === member.timestamp && (entry.kind ?? (member.family === "audit" ? "rendering" : "density")) === member.kind
          && (!definition.campaignId || entry.campaignId === definition.campaignId));
        const id = `${member.family === "audit" ? "rendering" : member.family === "perceived" ? "responsiveness" : "density"}/${member.kind}/${member.timestamp}`;
        if (candidates.length !== 1) { checkpoint.missing.push(`${id}: ${candidates.length ? "ambiguous" : "missing"}`); continue; }
        const sourceRecord = candidates[0], sourceCollection = member.family === "perceived" ? "perceived" : "metrics";
        const entry = entries[id] ??= { ...sourceRecord, id, family: member.family, kind: member.kind, sourceRecord, sourceCollection, source: `../results/${member.family}-log.json`, sourceFingerprint: sourceRecord.environment?.appSourceDirtyStateHash ?? null, records: [], scenarioCount: Object.keys(sourceRecord[sourceCollection] ?? {}).length };
        checkpoint.members.push(id);
        for (const [scenario, raw] of Object.entries(sourceRecord[sourceCollection] ?? {})) {
          const recordId = `${id}/${scenario}/r${raw.scenarioRevision ?? "unknown"}`;
          if (!records[recordId]) {
            records[recordId] = { ...describe(scenario, raw), id: recordId, entry: id, scenario, raw, family: member.family, kind: member.kind, synthetic: Boolean(definition.synthetic) };
            entry.records.push(recordId);
          }
        }
        checkpoint.completed += entry.records.filter(recordId => !member.scenarios || member.scenarios.includes(records[recordId].scenario)).length;
        if (entry.records.length !== member.expected) checkpoint.missing.push(`${id}: ${entry.records.length}/${member.expected} records`);
        if (member.scenarios) {
          const actual = Object.keys(sourceRecord[sourceCollection] ?? {});
          for (const scenario of member.scenarios.filter(scenario => !actual.includes(scenario))) checkpoint.missing.push(`${id}/${scenario}: missing`);
          for (const scenario of actual.filter(scenario => !member.scenarios.includes(scenario))) checkpoint.missing.push(`${id}/${scenario}: unexpected`);
        }
      }
      const environments = checkpoint.members.map(id => entries[id].environment ?? {});
      checkpoint.environment = Object.fromEntries([...new Set(environments.flatMap(environment => Object.keys(environment)))].map(key => [key, environments.every(environment => JSON.stringify(environment[key]) === JSON.stringify(environments[0][key])) ? environments[0][key] : null]));
      const sources = checkpoint.members.map(id => entries[id].gitSha);
      checkpoint.gitSha = checkpoint.missing.length === 0 && sources.length === definition.members.length
        && sources.length > 0 && sources[0] && sources.every(source => source === sources[0]) ? sources[0] : null;
      checkpoints[definition.id] = checkpoint;
    }
    return { records, entries, checkpoints };
  }
  function route(state) {
    const params = new URLSearchParams({ checkpoint: state.cp, baseline: state.base, view: state.view });
    for (const field of ["mode", "evidence", "metric", "scenario", "side", "group", "density", "direction", "phase", "workload", "statistic", "searchPhase", "searchRegime"]) if (state[field]) params.set(field, state[field]);
    return `#${params}`;
  }
  function buildAll(histories) {
    return build(histories, Object.entries(histories).flatMap(([family, log]) => (log?.entries ?? []).map(entry => {
      const kind = entry.kind ?? (family === "audit" ? "rendering" : "density");
      return { id: `history:${family}:${kind}:${entry.timestamp}`, members: [{ family, kind, timestamp: entry.timestamp,
        expected: Object.keys((family === "perceived" ? entry.perceived : entry.metrics) ?? {}).length }] };
    })));
  }
  // Newest-last values for the record's scenario on the same data mode/topology, stopping at the first non-comparable or missing value.
  function trend(all, record, field, valueOf) {
    const current = all.entries[record?.entry];
    if (!current || record.synthetic) return null;
    const env = current.environment ?? {};
    const prior = Object.values(all.entries).filter(entry => entry.family === current.family && entry.kind === current.kind
      && entry.timestamp < current.timestamp && entry.environment?.dataMode === env.dataMode && entry.environment?.apiTopology === env.apiTopology)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const first = valueOf(record);
    if (!finite(first)) return null;
    const values = [first];
    for (const entry of prior) {
      const before = entry.records.map(id => all.records[id]).find(candidate => candidate.scenario === record.scenario);
      if (!before || !recordPair(record, before, current, entry, field).ok) break;
      const value = valueOf(before);
      if (!finite(value)) break;
      values.unshift(value);
    }
    return { dataMode: env.dataMode ?? null, apiTopology: env.apiTopology ?? null, values };
  }
  // Only complete runner-published manifests become checkpoints; no label or time grouping.
  function campaignDefinitions(log) {
    return (log?.entries ?? []).filter(campaign => campaign.complete === true && campaign.campaignId && campaign.entries?.length).map(campaign => ({
      id: `campaign:${campaign.campaignId}`, campaignId: campaign.campaignId, synthetic: false,
      name: `${campaign.label} · ${String(campaign.completedAt).slice(0, 10)}`,
      note: "Runner-published campaign: membership recorded in the same transaction as its history entries.",
      members: campaign.entries.map(entry => ({ family: entry.family, kind: entry.kind, timestamp: entry.timestamp, expected: entry.scenarios.length, scenarios: entry.scenarios }))
    }));
  }
  globalThis.KupuaDashboardData = { build, buildAll, trend, campaignDefinitions, members, definitions, read, measure, statistic, tailLabel, population, completion, validity, fieldStatus, phaseField, baseField, fieldPhase, completeValue, captureIs, pressureCaptureValid, searchGroup, refreshOutcomes, recordPair, route };
})();