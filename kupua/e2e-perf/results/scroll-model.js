"use strict";
(() => {
  const shared = globalThis.KupuaDashboardData;
  const field = shared.phaseField;
  const fieldFor = field;
  const baseField = shared.baseField;
  const fieldPhase = shared.fieldPhase;
  const value = (record, key, statistic = "median") => statistic === "median" ? shared.measure(record, key)
    : statistic === "p95" ? shared.statistic(record, key)?.p95 ?? null : null;
  const reason = (record, key) => shared.fieldStatus(record, key).reason;
  const completeValue = (record, key) => value(record, key);
  const captureIs = (record, key, expected) => value(record, key) === expected && value(record, key, "p95") === expected;
  const pressureCaptureValid = record => shared.pressureCaptureValid(record);
  function summarize(entry, adaptedRecords, density) {
    const records = adaptedRecords.filter(record => record.family === "density" && record.entry === entry?.id);
    const journeys = ["scroll-forward", "scroll-backward"].map(workload => records.find(record => record.raw.density === density && record.raw.workload === workload));
    const result = { density, journeys, scores: {}, reasons: {}, components: {}, compatibility: null };
    const valid = entry?.environmentCompatibilityKey && journeys.every(record => record
      && shared.validity(record) && record.raw.supported !== false
      && (record.raw.scenarioRevision === 3 && record.raw.profile === "density-v3-100resultsps-10s-3phases-stability" || pressureCaptureValid(record))
      && ["profile", "cacheClass", "completionBoundary", "resultRegime"].every(key => typeof record.raw[key] === "string" && record.raw[key])
      && (!entry.runs || record.raw.sampleCount === entry.runs)
      && captureIs(record, "journeyCaptureRevision", 1) && captureIs(record, "journeyOverflow", 0)
      && captureIs(record, "enduranceInterrupted", 0) && (record.raw.scenarioRevision === 4 || captureIs(record, "refillCoverageComplete", 1)));
    if (!valid) {
      for (const star of ["progress", "smoothness", "stability"]) result.reasons[star] = journeys.every(Boolean)
        ? "Incomplete or unverified capture" : "Forward/backward browsing not measured";
      return result;
    }
    result.compatibility = JSON.stringify(journeys.map(record => [record.raw.scenarioRevision, record.raw.workload, record.raw.profile,
      record.raw.cacheClass, record.raw.completionBoundary, record.raw.resultRegime, record.raw.sampleCount]));
    const fractions = { progress: [], smoothness: [], stability: [] };
    const component = (star, name, fraction, record, key, phase = "") => {
      (result.components[star] ??= []).push({ name, fraction, record, key, phase });
      if (!Number.isFinite(fraction) || fraction < 0) result.reasons[star] = "Required evidence unavailable";
      else fractions[star].push(Math.min(1, fraction));
    };
    for (const record of journeys) {
      const value = key => completeValue(record, key);
      const direction = record.raw.workload === "scroll-forward" ? "Forward" : "Backward";
      const requested = value("requestedResultsPerSecond"), achieved = value("achievedResultsPerSecond");
      if (record.raw.scenarioRevision !== 4) component("progress", `${direction}: delivered result rate`, requested > 0 && achieved !== null ? achieved / requested : null, record, "achievedResultsPerSecond");
      if (record.raw.scenarioRevision === 4 && (!captureIs(record, "stopDataCensored", 0) || !captureIs(record, "stopMediaCensored", 0))) result.reasons.progress = "Stopped recovery censored; inspect landing evidence";
      for (const phase of ["early", "middle", "late", ...(record.raw.scenarioRevision === 4 && record.raw.workload === "scroll-backward" ? ["reversal"] : [])]) {
        const read = name => value(fieldFor(name, phase));
        const pending = read("pendingVisibleRatioMean"), duration = read("drivenDurationMs"), blocked = read("bufferEdgeBlockedMs");
        const frame = read("frameP95Ms"), severe = read("severeFrameCount"), count = read("frameCount");
        const label = `${direction}, ${phase}`;
        if (record.raw.scenarioRevision === 4) component("progress", `${label}: delivered result rate`, read("requestedResultsPerSecond") > 0
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
      const gap = value("stabilityObservationGapMaxMs") === null ? null : record.raw.metrics.stabilityObservationGapMaxMs.p95;
      if (gap === null || gap > 250) result.reasons.stability = gap === null ? "Sampling coverage unavailable" : "Sampling gaps exceed 250ms";
      component("stability", `${direction}: retained geometry`, displacement !== null && resize !== null && displacement >= 0 && resize >= 0
        ? 1 / (1 + Math.max(0, displacement - 1, resize - 1)) : null, record, resize > displacement ? "retainedResizeMaxPx" : "retainedDisplacementMaxPx");
      component("stability", `${direction}: retained images ready`, comparisons > 0 && unready !== null && unready >= 0 && unready <= comparisons ? 1 - unready / comparisons : null, record, "retainedUnreadySamples");
      if (record.raw.scenarioRevision === 4 && (!captureIs(record, "stopCohortChanged", 0) || !captureIs(record, "postReadyCohortStable", 1))) result.reasons.stability = "Stopped destination changed or unavailable";
      if (record.raw.scenarioRevision === 4 && record.raw.workload === "scroll-backward") {
        const reverse = key => value(fieldFor(key, "reversal"));
        if (!captureIs(record, "reversalStabilityCaptureRevision", 1) || !captureIs(record, "reversalRetainedSourceChanges", 0)
          || reverse("stabilityObservationGapMaxMs") === null || record.raw.metrics.reversalStabilityObservationGapMaxMs.p95 > 250) result.reasons.stability = "Reversal stability requires inspection";
        const displacement = reverse("retainedDisplacementMaxPx"), resize = reverse("retainedResizeMaxPx");
        component("stability", "Reversal: retained geometry", displacement !== null && resize !== null ? 1 / (1 + Math.max(0, displacement - 1, resize - 1)) : null, record, resize > displacement ? "retainedResizeMaxPx" : "retainedDisplacementMaxPx", "reversal");
        component("stability", "Reversal: retained images ready", reverse("retainedComparisons") > 0 && reverse("retainedUnreadySamples") !== null
          ? 1 - reverse("retainedUnreadySamples") / reverse("retainedComparisons") : null, record, "retainedUnreadySamples", "reversal");
      }
    }
    for (const star of Object.keys(fractions)) if (!result.reasons[star] && fractions[star].length) result.scores[star] = Math.round(1000 * Math.min(...fractions[star])) / 10;
    return result;
  }
  globalThis.KupuaScrollModel = { field, baseField, fieldPhase, value, reason, summarize };
})();
