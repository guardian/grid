"use strict";
(() => {
  const shared = globalThis.KupuaDashboardData;
  const group = record => shared.searchGroup(record);
  const phase = (_record, field) => field;
  const value = (record, field) => shared.measure(record, field);
  const reason = (record, field) => shared.fieldStatus(record, field).reason;
  function tail(record, field) {
    const key = record?.raw.metrics?.[field] ? field : field.replace(/_ms$/, "_p95_ms");
    const measured = record?.raw.metrics?.[field] ? shared.statistic(record, field)?.p95 ?? null : value(record, key);
    return { field: key, value: measured, label: record ? shared.tailLabel(record, key) : "Recorded p95" };
  }
  function outcomes(record) {
    const empty = (state, reason) => ({ state, healthy: null, degraded: null, total: null, reason });
    if (!record || !/^(?:PP|JA|JB)/.test(record.scenario)) return empty("absent", "No responsiveness outcomes for this record");
    if (!shared.validity(record)) return empty("invalid", "Invalid capture or outcome counts");
    if (record.raw.supported === false) return empty("unsupported", "Unsupported measurement");
    if (record.scenario === "PP10") return empty("background", "Background map publication is not foreground completion");
    const healthy = record.raw.sampleCount, degraded = record.raw.degradedCount ?? 0;
    if (!Number.isInteger(degraded) || degraded < 0 || degraded > 0 && !["PP3", "PP4"].includes(record.scenario))
      return empty("invalid", "Invalid degraded outcome counts");
    const total = healthy + degraded;
    return { state: total === 0 ? "empty" : healthy === 0 ? "degraded" : degraded > 0 ? "mixed" : "healthy", healthy, degraded, total,
      reason: total === 0 ? "No recorded outcomes" : degraded > 0 ? "Healthy-only timing contributors; degraded fallback is not preservation" : "Recorded healthy outcomes" };
  }
  function assessmentEvidence(record) {
    if (!["PP3", "PP7"].includes(record?.scenario)) return { usable: false, reason: "No existing provisional action-grade rule" };
    const result = outcomes(record);
    if (!(result.total > 0)) return { usable: false, reason: result.reason };
    if (result.degraded > 0) return { usable: true, reason: "Degraded outcomes override successful-only timing", outcomes: result };
    return { usable: value(record, "dt_visual_settled_ms") !== null, reason: reason(record, "dt_visual_settled_ms"), outcomes: result };
  }
  globalThis.KupuaSearchModel = { group, phase, value, tail, reason, outcomes, assessmentEvidence, refreshOutcomes: shared.refreshOutcomes };
})();
