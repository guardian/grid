"use strict";
(() => {
  const entries = Array.isArray(window.__DENSITY_LOG__?.entries) ? window.__DENSITY_LOG__.entries : [];
  const rows = entries.flatMap((entry, campaign) => Object.values(entry.metrics ?? {}).map(record => ({ entry, campaign, record })));
  const $ = id => document.getElementById(id);
  const make = (tag, value, className) => { const el = document.createElement(tag); if (value != null) el.textContent = value; if (className) el.className = className; return el; };
  const names = { grid: "Grid", justified: "Justified", table: "Table" };
  const colors = { grid: "#71afff", justified: "#ffbf69", table: "#c4a0ff" };
  const workload = {
    "scroll-cold": ["D1 · Scroll / cache bypass", "New requests bypass browser cache during observation; already-loaded pictures remain loaded."],
    "scroll-warm": ["D2 · Scroll / repeat path", "The same path is traversed after priming. This is not a guarantee that every picture is cached."],
    "table-transition": ["D3 · Table → image layout", "Warm destination renderer; the same source image is retained. Visible-image counts can differ by layout."],
    "detail-return": ["D4 · Return from detail", "Native close to the original image in the list, without detail traversal."],
    seek: ["D5 · Scrubber seek", "Placement and visible-media readiness after moving to a new neighbourhood."],
    reflow: ["D6 · Width change", "The viewport narrows from 1720px to 1100px around the same image."],
    "window-maintenance": ["D7 · Window eviction", "A jump into the admission band triggers real eviction. Not a constant-speed or necessarily equal-read-count comparison."],
    "scroll-constrained": ["D8 · Scroll / constrained network", "80ms latency and 4Mibit/s download during the four-second scroll only, including any data refills."],
    "burst-recovery": ["D9 · Burst, reverse and recover", "Fresh paired window; 3 seconds backward then 1.5 seconds forward at 4,000px/s. Browser-cache bypass continues through stopped-viewport recovery."],
    "scroll-endurance": ["D10 · Sustained scroll", "Three consecutive eight-second segments at 1,200px/s. Early/middle/late measurements retain in-flight requests across boundaries; dispatch gaps are recorded."],
    "refresh-contention": ["D11 · Search refresh / media overlap", "Matched same-query refreshes after drained versus active image traffic. Both use 80ms latency and 4Mibit/s download; check overlap evidence before interpreting a difference."],
  };
  // Value scale converts stored fractions into human percentages; histories remain untouched.
  const metricInfo = {
    bufferEdgeBlockedMs: ["Input blocked at buffer edges", "ms", 1, "lower", "Equivalent commanded scrolling time clipped at temporary seek-mode buffer limits during D9.", "Not frame jank or native wheel latency. Zero alone is not edge-coverage proof; inspect movement and refill counts. True result ends are excluded."],
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
    thumbnailPendingAreaRatioMax: ["Worst sampled blank thumbnail area", "%", 100, "lower", "Largest sampled portion of the results viewport awaiting thumbnail load/decode.", "This is one frame sample, not the average and not bitmap-only area."],
    thumbnailBlankViewportMs: ["Time with any blank thumbnail", "ms", 1, "lower", "Time during which at least some visible thumbnail area was pending.", "4,000ms does not mean the entire viewport was blank for four seconds."],
    thumbnailVisibleWaitMaxMs: ["Longest observed visible thumbnail wait", "ms", 1, "lower", "Longest observed continuous interval with a visible thumbnail awaiting load/decode.", "Includes lower bounds from censored waits. Departure, replacement, failure or observation end need not mean the image became ready."],
    thumbnailVisibleWaitCompletedMaxMs: ["Longest completed visible thumbnail wait", "ms", 1, "lower", "Longest continuous visible wait observed to end in successful decode.", "Unavailable when no wait completed; compare censored waits too, not just successful images."],
    thumbnailVisibleWaitCensoredCount: ["Visible thumbnail waits censored", "count", 1, "diagnostic", "Waits whose successful visible decode was not observed before departure, replacement, failure or observation end.", "These are visibility episodes, not unique images or permanent failures."],
    mediaRequestStarts: ["Image requests started", "count", 1, "diagnostic", "Browser Image requests first observed during this measurement phase.", "Includes speculative work; fewer requests is not automatically better. Pre-existing requests outside the collector are not claimed."],
    mediaRequestsPending: ["Image requests still in flight", "count", 1, "diagnostic", "Observed image requests still outstanding at the measurement boundary, including carry-in.", "This is network completion, not decode or paint; it can include off-screen work."],
    mediaRequestsPeak: ["Peak image requests in flight", "count", 1, "diagnostic", "Peak outstanding observed image requests within the phase, including carry-in.", "Request concurrency is not active connection count or backend load."],
    mediaCompletedBytes: ["Completed image transfer bytes", "kB", 0.001, "diagnostic", "CDP encoded transfer bytes for requests completed in the phase.", "Unavailable if redirect or missing-byte evidence prevents a complete total. Excludes pending/failed transfers; not backend work or decoded memory."],
    mediaRequestDurationMaxMs: ["Slowest completed image request", "ms", 1, "lower", "Longest browser request-start to completion interval among timed completed image requests.", "Incomplete requests are excluded; inspect pending work and visible waits too."],
    dataRequestStarts: ["Data requests started", "count", 1, "diagnostic", "Observed API/ES request starts during the phase.", "Can include counts or other overlapping data calls; this is not an exclusively action-owned request count."],
    dataRequestsPending: ["Data requests still in flight", "count", 1, "diagnostic", "Observed API/ES requests outstanding at the measurement boundary.", "Data publication and visible placement may occur later than network completion."],
    dataRequestDurationMaxMs: ["Slowest completed data request", "ms", 1, "lower", "Longest timed API/ES request interval completed during the phase.", "Browser-facing duration is not server CPU time and excludes unfinished requests."],
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
  for (const [prefix, label] of [["early", "Early"], ["middle", "Middle"], ["late", "Late"]]) {
    for (const key of ["thumbnailPendingAreaRatioMean", "thumbnailVisibleWaitMaxMs", "thumbnailVisibleWaitCensoredCount",
      "frameP95Ms", "drivenDistancePx", "mediaRequestStarts", "mediaRequestsPending", "mediaRequestsPeak",
      "mediaCompletedBytes", "dataRequestStarts", "dataRequestsPending", "dataRequestDurationMaxMs"]) {
      const [title, unit, scale, direction, description, caution] = metricInfo[key];
      metricInfo[prefix + key[0].toUpperCase() + key.slice(1)] = [`${label} · ${title}`, unit, scale, direction,
        `${label} eight-second endurance segment. ${description}`, caution];
    }
  }
  for (const [prefix, label] of [["quiet", "Media-drained"], ["busy", "Media-active"]]) {
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
  const environments = [...new Set(entries.map(e => e.environmentCompatibilityKey).filter(Boolean))];
  const friendlyEnv = key => {
    const e = entries.find(entry => entry.environmentCompatibilityKey === key)?.environment;
    if (!e) return "Unverified environment";
    const label = e.dataMode === "direct-es" ? "Direct ES" : e.dataMode === "media-api" ? (e.apiTopology === "local" ? "Local media-api" : `${e.apiTopology} media-api`) : e.dataMode;
    const same = environments.filter(other => {
      const v = entries.find(entry => entry.environmentCompatibilityKey === other)?.environment;
      return v?.dataMode === e.dataMode && v?.apiTopology === e.apiTopology;
    });
    return `${label}${same.length > 1 ? ` · configuration ${same.indexOf(key) + 1}` : ""}`;
  };
  const profileName = p => p?.includes("endurance") ? "Sustained scroll" : p?.includes("refresh-media-overlap") ? "Search / media overlap"
    : p?.includes("recovery") ? "Burst / reversal recovery" : p?.includes("scroll-only") ? "Constrained scroll" : p?.includes("unthrottled") ? "Unthrottled" : "Other / historical profile";
  const infoFor = key => {
    if (metricInfo[key]) return metricInfo[key];
    const unit = /AreaMs$/.test(key) ? "px²·ms" : /Ratio/.test(key) ? "%" : /PxPerSec/.test(key) ? "px/s"
      : /Shift.*Value$/.test(key) ? "score" : /Ms$/.test(key) ? "ms" : /Px/.test(key) ? "px" : /Revision$/.test(key) ? "revision" : "count";
    return [key.replace(/([a-z])([A-Z])/g, "$1 $2"), unit, unit === "%" ? 100 : 1, "diagnostic", "Additional recorded diagnostic; not an overall performance score.", "Technical field name is shown below. Consult the performance handbook for the observation boundary."];
  };
  const option = (value, label) => { const el = make("option", label); el.value = value; return el; };
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
  function populateMetrics() {
    const previous = controls.Metric.value;
    const preferred = Object.keys(metricInfo).filter(key => allMetrics.includes(key));
    const keys = $("all-metrics").checked ? [...preferred, ...allMetrics.filter(key => !preferred.includes(key))] : preferred.length ? preferred : allMetrics;
    controls.Metric.replaceChildren(...keys.map(key => option(key, `${infoFor(key)[0]} · ${infoFor(key)[1]}`)));
    const hasThumbnail = rows.some(row => Number.isFinite(row.record.metrics.thumbnailPendingAreaRatioMean?.median));
    const fallback = hasThumbnail ? "thumbnailPendingAreaRatioMean" : allMetrics.includes("pendingAreaRatioMean") ? "pendingAreaRatioMean" : keys[0];
    controls.Metric.value = keys.includes(previous) ? previous : keys.includes(fallback) ? fallback : keys[0] ?? "";
  }
  populateMetrics();
  let view = "latest";
  let tooltipTarget = null;
  const tooltip = $("tooltip");
  const fmt = (value, key = controls.Metric.value, delta = false) => {
    if (!Number.isFinite(value)) return "unavailable";
    const [, unit, scale] = infoFor(key), scaled = value * scale;
    const small = Math.abs(scaled) > 0 && Math.abs(scaled) < 0.001;
    const digits = unit === "score" ? 6 : unit === "%" ? 2 : 1;
    const result = small ? scaled.toExponential(1) : scaled.toLocaleString(undefined, { maximumFractionDigits: digits });
    return `${delta && scaled > 0 ? "+" : ""}${result}${unit === "count" ? "" : unit === "%" && !delta ? "%" : ` ${delta && unit === "%" ? "pp" : unit}`}`;
  };
  const valueOf = (row, stat = controls.Statistic.value) => row.record.metrics[controls.Metric.value]?.[stat];
  const matches = row => (!controls.Environment.value || (controls.Environment.value === "unverified" ? !row.entry.environmentCompatibilityKey : row.entry.environmentCompatibilityKey === controls.Environment.value)) &&
    [["Workload", "workload"], ["Density", "density"], ["Regime", "resultRegime"], ["Profile", "profile"]].every(([name, field]) => !controls[name].value || row.record[field] === controls[name].value);
  function hideTooltip() {
    tooltip.hidden = true;
    tooltipTarget?.removeAttribute("aria-describedby"); tooltipTarget = null;
  }
  function showTooltip(row, mark, event) {
    hideTooltip(); tooltipTarget = mark; mark.setAttribute("aria-describedby", "tooltip");
    const key = controls.Metric.value, value = row.record.metrics[key];
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
    const group = svgElement(svg, "g", { class: "mark", tabindex: 0, role: "img", "aria-label": `${names[row.record.density]}: ${fmt(valueOf(row))}; ${date(row.entry.timestamp)}; ${row.record.metrics[controls.Metric.value]?.sampleCount ?? 0}/${row.record.sampleCount} samples` });
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
  }
  function tableRow(target, values) { const tr = make("tr"); values.forEach(value => tr.append(make("td", value))); target.append(tr); }
  function render() {
    hideTooltip();
    const key = controls.Metric.value, info = infoFor(key);
    const filtered = rows.filter(matches);
    $("metric-title").textContent = `${info[0]}${info[3] === "lower" ? " · lower is better" : info[3] === "lead" ? " · positive means earlier" : " · diagnostic, not a ranking"}`;
    $("metric-explanation").textContent = info[4]; $("metric-caution").textContent = info[5]; $("metric-key").textContent = key ? `Recorded field: ${key}` : "No recorded metrics";
    $("metric-position").textContent = `${Math.max(0, controls.Metric.selectedIndex + 1)} / ${controls.Metric.options.length}`;
    $("previous-metric").disabled = !controls.Metric.options.length || controls.Metric.selectedIndex <= 0;
    $("next-metric").disabled = !controls.Metric.options.length || controls.Metric.selectedIndex >= controls.Metric.options.length - 1;
    $("status").textContent = entries.length ? `${entries.length} completed campaigns · ${environments.length} environment configurations · ${entries.map(e => e.runs).filter(Number.isFinite).join(" / ") || "unknown"} repetitions per campaign` : "No density history yet. An operator-run campaign creates density-log.js; existing histories are never substituted.";
    $("evidence").textContent = "Compare Grid and Justified within each campaign. Environments are shown separately—not a controlled direct-ES versus API experiment. One historical point is not a trend; repetitions are samples within that point.";
    const groups = new Map();
    for (const row of filtered) {
      const id = row.entry.environmentCompatibilityKey && row.record.pairedContractKey ? `${row.entry.environmentCompatibilityKey}|${row.record.pairedContractKey}` : `unverified:${row.campaign}:${row.record.id}`;
      if (!groups.has(id)) groups.set(id, []); groups.get(id).push(row);
    }
    for (const [id, group] of groups) if (!group.some(row => Object.hasOwn(row.record.metrics ?? {}, key))) groups.delete(id);
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
      if (view === "latest") drawLatest(card, latest, scale); else drawHistory(card, group, scale);
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
      tableRow(pairs, [entry.label, `${control.id} ↔ ${candidate.id}`, info[0], Number.isFinite(a) && Number.isFinite(b) ? fmt(b - a, key, true) : "unavailable", `${Math.min(candidate.sampleCount, control.sampleCount)} repetitions; descriptive only`]);
    }
    if (!pairs.childElementCount) tableRow(pairs, ["No compatible pairs for this selection", "", "", "", ""]);
  }
  function cycle(direction) {
    const select = controls.Metric; if (!select.options.length) return;
    select.selectedIndex = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + direction));
    render();
  }
  $("previous-metric").addEventListener("click", () => cycle(-1)); $("next-metric").addEventListener("click", () => cycle(1));
  controls.Metric.addEventListener("change", render); controls.Environment.addEventListener("change", render);
  $("all-metrics").addEventListener("change", () => { populateMetrics(); render(); });
  for (const choice of ["latest", "history"]) $(`${choice}-view`).addEventListener("click", () => { view = choice; for (const v of ["latest", "history"]) $(`${v}-view`).setAttribute("aria-pressed", String(v === view)); render(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") { hideTooltip(); return; }
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
