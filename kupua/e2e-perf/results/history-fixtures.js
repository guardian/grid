"use strict";
(() => {
  const SOURCES = { r2: "2026-10-15T14:47:23.583Z", r4: "2026-10-22T23:01:03.116Z", canonical: "2026-10-24T08:49:53.477Z" };
  const clone = value => JSON.parse(JSON.stringify(value));
  const unavailable = (metric, total) => Object.assign(metric, { median: null, p95: null, sampleCount: 0, unavailableCount: total });
  const steps = [
    ["r2", "old r2 contract"],
    ["r2", "old r2 contract · Table scenario missing", entry => { delete entry.metrics["D1-table"]; delete entry.metrics["D2-table"]; }],
    ["r4", "r4 · designated baseline"],
    ["r4", "r4 · Justified pending slots really 0", entry => {
      for (const workload of ["D1", "D2"]) for (const phase of ["early", "middle", "late"])
        Object.assign(entry.metrics[`${workload}-justified`].metrics[`${phase}PendingVisibleRatioMean`], { median: 0, p95: 0 });
    }],
    ["r4", "r4 · environment unrecorded", entry => { for (const key of ["dataMode", "apiTopology", "mediaDelivery"]) delete entry.environment[key]; }],
    ["canonical", "TEST API canonical · single sparse point"],
    ["r4", "r4 · Table recovery censored, Justified pending partial", entry => {
      for (const workload of ["D1", "D2"]) {
        const table = entry.metrics[`${workload}-table`];
        unavailable(table.metrics.stopMediaReadyMs, table.sampleCount);
        Object.assign(table.metrics.stopMediaCensored, { median: 1, p95: 1 });
        for (const phase of ["early", "middle", "late"])
          Object.assign(entry.metrics[`${workload}-justified`].metrics[`${phase}PendingVisibleRatioMean`], { sampleCount: 2, unavailableCount: 2 });
      }
    }],
    ["r4", "r4 · Grid capture invalid", entry => { entry.metrics["D1-grid"].captureValid = false; entry.metrics["D2-grid"].captureValid = false; }],
    ["r4", "r4 · clean, same environment as baseline"]
  ];
  function build(log) {
    const source = key => {
      const found = log.entries.filter(entry => entry.timestamp === SOURCES[key]);
      if (found.length !== 1) throw new Error(`Synthetic history source ${SOURCES[key]} ${found.length ? "ambiguous" : "missing"}`);
      return found[0];
    };
    const entries = steps.map(([key, label, mutate], index) => {
      const entry = clone(source(key));
      entry.timestamp = `2030-01-0${index + 1}T12:00:00.000Z`;
      entry.label = `SYNTHETIC · ${label}`;
      entry.synthetic = true;
      mutate?.(entry);
      return entry;
    });
    return { entries, defaultBaseline: entries[2].timestamp };
  }
  globalThis.KupuaHistoryFixtures = { build, sources: SOURCES };
})();
