"use strict";
(() => {
  const fields = ["dataMode", "apiTopology", "mediaDelivery", "appBaseUrl", "browserName", "browserVersion",
    "os", "viewport", "screen", "deviceScaleFactor", "headed", "cpuThrottle", "cacheClass", "workers", "stableUntil"];
  const treatments = ["apiTopology", "mediaDelivery"];
  const value = (entry, field) => field === "stableUntil"
    ? entry.environment?.stableUntil ?? entry.stableUntil : entry.environment?.[field];
  const known = item => item !== undefined && item !== null && item !== "unknown" && item !== "";
  const key = entry => JSON.stringify(fields.map(field => value(entry, field) ?? null));
  const variant = entry => JSON.stringify([entry.environment?.dataMode ?? "unknown",
    entry.environment?.apiTopology ?? "unknown", entry.environment?.mediaDelivery ?? "unknown"]);
  const acquisitionLabel = entry => {
    const acquisition = entry.acquisition, counts = acquisition?.counts;
    return acquisition?.revision === 1 && counts
      ? `${acquisition.status.toUpperCase()} | ${counts.completed}/${counts.attempted} completed/attempted | ${counts.planned} planned | ${counts.failed} failed | ${counts.invalid} invalid | ${counts.notAttempted} not attempted | ${counts.adverse} adverse`
      : "Acquisition failure counts unrecorded (legacy)";
  };
  const acquisitionEligible = entry => !entry?.acquisition || entry.acquisition.revision === 1 && entry.acquisition.status === "complete";
  const label = entry => {
    const environment = entry.environment ?? {};
    const backend = environment.dataMode === "direct-es" ? "Direct ES" : environment.dataMode === "media-api"
      ? environment.apiTopology === "local" ? "Local API" : environment.apiTopology === "deployed-test" ? "TEST API" : "API (topology unknown)"
      : "Legacy / unknown";
    return `${backend} / ${environment.mediaDelivery === "canonical" ? "canonical" : environment.mediaDelivery === "proxy" ? "proxy" : "delivery unknown"}${entry.acquisition ? ` / ${acquisitionLabel(entry)}` : ""}`;
  };
  const source = (left, right) => {
    if ([left, right].every(entry => entry?.environment?.sourceFingerprintRevision === 2)
      && known(left.environment.appSourceDirtyStateHash) && known(right.environment.appSourceDirtyStateHash)) {
      return left.environment.appSourceDirtyStateHash === right.environment.appSourceDirtyStateHash
        ? "tracked and untracked source content fingerprints match" : "tracked and untracked source content fingerprints differ";
    }
    if (!known(left?.gitSha) || !known(right?.gitSha)
      || !known(left?.environment?.appSourceDirtyStateHash) || !known(right?.environment?.appSourceDirtyStateHash)) return "recorded source fingerprints unavailable; identical source not verified (untracked file contents not covered)";
    return left.gitSha === right.gitSha && left.environment.appSourceDirtyStateHash === right.environment.appSourceDirtyStateHash
      ? "recorded source fingerprints match; identical source not verified (untracked file contents not covered)" : "recorded source fingerprints differ (untracked file contents not covered)";
  };
  const compare = (left, right) => {
    if (!left || !right) return { compatible: false, reason: "No comparison selected" };
    if (![left, right].every(acquisitionEligible)) return { compatible: false, reason: "Incomplete, invalid or adverse acquisition; not a complete-checkpoint comparison" };
    const missing = fields.filter(field => !known(value(left, field)) || !known(value(right, field)));
    if (missing.length) return { compatible: false, reason: `Unverified environment: ${missing.join(", ")}` };
    const changed = fields.filter(field => JSON.stringify(value(left, field)) !== JSON.stringify(value(right, field)));
    const incompatible = changed.filter(field => !treatments.includes(field));
    if (incompatible.length) return { compatible: false, reason: `Different ${incompatible.join(", ")}` };
    return { compatible: true, reason: `${changed.length ? `Changed ${changed.join(" + ")}` : "Same environment"}; ${source(left, right)}; content/cache warmth uncontrolled` };
  };
  const normalizeTreatment = (entry, reference) => ({ ...entry, environment: { ...entry.environment,
    ...Object.fromEntries(treatments.map(field => [field, reference.environment?.[field]])) } });
  const style = entry => {
    const environment = entry.environment ?? {};
    const color = environment.dataMode === "direct-es" ? "#00adee" : environment.dataMode !== "media-api" ? "#a6a6a6"
      : environment.mediaDelivery === "canonical" ? "#71c990" : environment.apiTopology === "deployed-test" ? "#ffbc01" : "#ee8888";
    return { color, fill: `${color}22` };
  };
  let entries = [];
  const selected = () => ["comparisonCampaign", "comparisonBaseline"].map(id => {
    const selection = document.getElementById(id)?.value;
    return selection === "" || selection === undefined ? null : entries[Number(selection)];
  });
  const populate = (nextEntries, onChange) => {
    entries = nextEntries;
    for (const id of ["comparisonCampaign", "comparisonBaseline"]) {
      const select = document.getElementById(id);
      select.replaceChildren(new Option(id === "comparisonCampaign" ? "History only" : "No comparison", ""));
      entries.forEach((entry, index) => select.add(new Option(`${entry.label} / ${entry.kind ?? "rendering"} / ${label(entry)} / ${(entry.timestamp ?? "").slice(0, 10)}`, String(index))));
      select.onchange = onChange;
    }
  };
  const status = () => {
    const [current, baseline] = selected();
    document.getElementById("comparisonStatus").textContent = !current ? "History" : !baseline
      ? `${current.label}: no comparison selected` : `${baseline.label} -> ${current.label}: ${compare(current, baseline).reason}`;
  };
  const restrict = candidates => {
    const [current, baseline] = selected();
    return current ? candidates.filter(entry => entry === current || entry === baseline) : candidates;
  };
  const showAcquisition = (candidates, anchor) => {
    let section = document.getElementById("acquisition-status");
    if (!candidates.some(entry => entry.acquisition)) { section?.remove(); return; }
    if (!section) {
      section = document.createElement("section");
      section.id = "acquisition-status";
      section.setAttribute("aria-label", "Acquisition outcomes");
      section.style.minWidth = "0";
      section.style.overflowWrap = "anywhere";
      (anchor ?? document.querySelector("header")).insertAdjacentElement("afterend", section);
    }
    section.replaceChildren();
    for (const entry of candidates.filter(entry => entry.acquisition)) {
      const heading = document.createElement("p");
      heading.textContent = `${entry.label}: ${acquisitionLabel(entry)}`;
      section.append(heading);
      const failures = entry.acquisition.repetitions?.flatMap(run => run.outcomes.filter(row => !["completed"].includes(row.status)).map(row => ({ repetition: run.repetition, ...row }))) ?? [];
      if (failures.length) {
        const details = document.createElement("details"), summary = document.createElement("summary"), evidence = document.createElement("pre");
        summary.textContent = "Failed, adverse and not-attempted measurements";
        evidence.textContent = JSON.stringify(failures, null, 2);
        evidence.style.whiteSpace = "pre-wrap";
        evidence.style.overflowWrap = "anywhere";
        details.append(summary, evidence);
        section.append(details);
      }
    }
  };
  const summary = (id, records, read, comparable, format) => {
    const [current, baseline] = selected();
    if (!current || !baseline) return "";
    const currentRecord = records(current)?.[id], before = records(baseline)?.[id];
    const result = compare(current, baseline);
    const node = document.createElement("span");
    node.className = "mode-summary selected-comparison";
    if (!result.compatible || !currentRecord || !before || !comparable(normalizeTreatment(current, baseline), currentRecord, baseline, before)) {
      node.textContent = "Selected pair: no comparable evidence";
    } else {
      const latest = read(currentRecord), previous = read(before);
      node.textContent = Number.isFinite(latest) && Number.isFinite(previous)
        ? `Selected pair: ${format(previous)} -> ${format(latest)}; delta ${format(latest - previous)}`
        : "Selected pair: measurement unavailable";
    }
    return node.outerHTML;
  };
  globalThis.KupuaPerfComparison = { key, variant, label, compare, normalizeTreatment, style, populate, status, summary, selected, restrict, acquisitionLabel, acquisitionEligible, showAcquisition };
})();