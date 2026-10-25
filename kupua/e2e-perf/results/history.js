"use strict";
(() => {
  const DATA = globalThis.KupuaDashboardData, CMP = globalThis.KupuaPerfComparison;
  const finite = n => typeof n === "number" && Number.isFinite(n);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
  const DENSITIES = { grid: "Grid", justified: "Justified", table: "Table" };
  const PHASES = { early: "Gentle · 30 results/s", middle: "Reference · 100 results/s", late: "Stress · 200 results/s", reversal: "Reversal (backward only)" };
  const TOPOLOGY = {
    direct: { label: "Direct ES", color: "#56B4E9" },
    local: { label: "Local API", color: "#E69F00" },
    test: { label: "TEST API", color: "#CC79A7" },
    unknown: { label: "Unrecorded", color: "#9a9a9a" }
  };
  const DELIVERY = { proxy: "proxy media", canonical: "canonical media", unknown: "delivery unrecorded" };
  const KINDS = { density: "Density", short: "Short responsiveness", long: "Long responsiveness", rendering: "Rendering audit" };
  const GLYPH = { unavailable: "×", partial: "!", invalid: "!", unsupported: "!", null: "×", absent: "–" };

  const scrollMetrics = [
    { id: "frame", base: "frameP95Ms", title: "Frame p95", unit: "ms", better: "lower", reference: 33.4 },
    { id: "pending", base: "pendingVisibleRatioMean", title: "Pending visible slots", unit: "%", factor: 100, better: "lower", reference: 20 },
    { id: "rate", base: "achievedResultsPerSecond", title: "Achieved results/s", unit: "results/s", better: "higher" },
    { id: "recovery", base: "stopMediaReadyMs", title: "Stop → decoded media", unit: "ms", better: "lower", unphased: true }
  ];
  function resolve(record, metric, phase) {
    const metrics = record.raw.metrics ?? {};
    if (metric.unphased) return own(metrics, metric.base) ? { key: metric.base, scope: "journey" } : null;
    const phased = DATA.phaseField(metric.base, phase);
    if (own(metrics, phased)) return { key: phased, scope: phase };
    const anyPhase = Object.keys(PHASES).some(p => own(metrics, DATA.phaseField(metric.base, p)));
    return !anyPhase && own(metrics, metric.base) ? { key: metric.base, scope: "journey" } : null;
  }
  const plain = key => record => own(record.raw, key) || own(record.raw.metrics, key) ? { key, scope: "journey" } : null;
  const column = (family, kind, scenario, label, key) => ({ id: scenario, family, kind, scenario, label, field: plain(key) });

  // The tracked list: the only metrics given history. Supporting/diagnostic records stay in Compare/evidence.
  const WORKFLOWS = {
    scroll: { title: "Scrolling & Layout", controls: ["dir", "phase"], synthetic: true,
      rows: scrollMetrics.map(metric => ({ ...metric, scope: view => metric.unphased ? "Whole journey · last motion stop" : `${PHASES[view.phase]} · ${view.dir}`,
        columns: Object.entries(DENSITIES).map(([density, label]) => ({ id: density, family: "density", kind: "density", label,
          scenario: view => `${view.dir === "backward" ? "D2" : "D1"}-${density}`, field: (record, view) => resolve(record, metric, view.phase) })) })) },
    search: { title: "Search & Navigation", controls: [],
      rows: [
        { id: "actions", title: "Action → visual settlement", unit: "ms", better: "lower", scope: () => "Healthy completions only; degraded counts in evidence",
          columns: [column("perceived", "short", "PP3", "Sort around focus", "dt_visual_settled_ms"), column("perceived", "short", "PP7", "Seek · scrubber click", "dt_visual_settled_ms"), column("perceived", "short", "PP11", "Back restoration", "dt_visual_settled_ms")] },
        { id: "journeys", title: "Journey → visual settlement", unit: "ms", better: "lower", scope: () => "Long suite · independent clocks",
          columns: [column("perceived", "long", "JA1", "Startup · buffer", "dt_visual_settled_ms"), column("perceived", "long", "JB1", "Startup · indexed", "dt_visual_settled_ms"), column("perceived", "long", "JB4", "Seek · indexed", "dt_visual_settled_ms")] }
      ] },
    images: { title: "Image Workflows", controls: [],
      rows: [
        { id: "detail", title: "Detail opening", unit: "ms", better: "lower", scope: () => "Independent clocks · never summed",
          columns: [column("audit", "rendering", "P13c", "Decoded / stable media", "detailImageReadyMs"), column("perceived", "long", "JA2", "Double-click · loaded / stable", "dt_visual_settled_ms")] },
        { id: "traversal", title: "Traversal · P14b fast forward", better: "higher", scope: () => "Loaded, not decoded or painted",
          columns: [{ ...column("audit", "rendering", "P14b", "Loaded within cadence", "renderedCount"), unit: "%", better: "higher", statisticFree: true,
            value: record => { const e = globalThis.ASSESSMENT.traversalEvidence(record); return e.usable ? e.percentage : { reason: e.reason }; } },
            { ...column("audit", "rendering", "P14b", "Final landing · limited clock (U1/U2)", "landingRenderMs"), id: "P14b-landing", unit: "ms", better: "lower" }] }
      ] }
  };

  // Operator-confirmed inference for entries saved before environment fields existed.
  function environment(entry) {
    const e = entry.environment ?? {}, label = entry.label ?? "";
    let inferred = false, dataMode = e.dataMode, apiTopology = e.apiTopology, mediaDelivery = e.mediaDelivery;
    if (!dataMode) { inferred = true; dataMode = /with API|use-media-api/i.test(label) ? "media-api" : "direct-es"; }
    if (!apiTopology && dataMode) { inferred = true; apiTopology = dataMode === "direct-es" ? "none" : "local"; }
    if (!mediaDelivery) { inferred = true; mediaDelivery = "proxy"; }
    const topology = dataMode === "direct-es" ? "direct" : dataMode === "media-api"
      ? apiTopology === "local" ? "local" : apiTopology === "deployed-test" ? "test" : "unknown" : "unknown";
    const delivery = DELIVERY[mediaDelivery] ? mediaDelivery : "unknown";
    return { id: `${topology}/${delivery}${inferred ? "/inferred" : ""}`, topology, delivery, inferred,
      label: `${TOPOLOGY[topology].label} · ${DELIVERY[delivery]}${inferred ? " (inferred)" : ""}` };
  }

  // Every saved entry is a point; nothing is grouped by label or registered by hand.
  function model(histories, synthetic) {
    const built = DATA.buildAll(histories);
    if (synthetic) for (const record of Object.values(built.records)) record.synthetic = true;
    const kinds = {};
    for (const entry of Object.values(built.entries).sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
      const records = Object.fromEntries(entry.records.map(id => [built.records[id].scenario, built.records[id]]));
      (kinds[entry.kind] ??= []).push({ ts: entry.timestamp, kind: entry.kind, label: entry.label ?? "", entry: { ...entry, synthetic }, records, env: environment(entry) });
    }
    return { kinds, synthetic };
  }

  function valueOf(record, key, view, col) {
    if (col.value) return col.value(record);
    if (view.stat === "p95" && record.raw.metrics?.[key]) return DATA.statistic(record, key)?.p95 ?? null;
    return DATA.measure(record, key);
  }
  // Scalar histories save p95 as a sibling field; the point must own that field, not the median's.
  function statisticField(record, field, view, col) {
    if (view.stat !== "p95" || col.value || record.raw.metrics?.[field.key]) return field;
    const key = [field.key.replace(/_ms$/, "_p95_ms"), field.key.replace(/Ms$/, "P95Ms")].find(k => k !== field.key && own(record.raw, k));
    return key ? { ...field, key } : null;
  }

  function point(item, row, col, view) {
    const scenario = typeof col.scenario === "function" ? col.scenario(view) : col.scenario;
    const record = item.records[scenario];
    const base = { item, row, col, scenario, record, value: null };
    if (!record) return { ...base, state: "absent", reason: "Scenario not recorded in this campaign" };
    const revision = record.raw.scenarioRevision;
    const contractField = col.field(record, view);
    if (!contractField) return { ...base, revision, state: "not-in-contract", reason: `Field not part of the r${revision ?? "?"} contract for this selection` };
    const field = statisticField(record, contractField, view, col);
    if (!field) return { ...base, revision, series: [item.env.id, `r${revision ?? "unknown"}`, contractField.scope].join("|"), state: "unavailable", reason: "No p95 saved for this field" };
    const series = [item.env.id, record.raw.contractKey ?? `r${revision ?? "unknown"}`, field.scope].join("|");
    const status = DATA.fieldStatus(record, field.key);
    let state = status.state, reason = status.reason, value = null;
    if (state === "available") {
      const read = valueOf(record, field.key, view, col);
      if (finite(read)) value = read * (col.factor ?? row.factor ?? 1);
      else { state = read?.reason ? "invalid" : "unavailable"; reason = read?.reason ?? "No finite saved value"; }
    }
    return { ...base, revision, field, series, saved: record.raw.metrics?.[field.key] ?? record.raw[field.key], state, reason, value };
  }

  function segments(points) {
    const last = new Map(), result = [];
    for (const p of points) {
      if (p.state === "absent") { for (const key of [...last.keys()]) if (key.startsWith(`${p.item.env.id}|`)) last.delete(key); continue; }
      if (!p.series) continue;
      const prev = last.get(p.series);
      if (prev && finite(prev.value) && finite(p.value) && DATA.recordPair(p.record, prev.record, p.item.entry, prev.item.entry, p.field.key).ok) result.push([prev, p]);
      last.set(p.series, p);
    }
    return result;
  }

  function delta(c, b) {
    if (!c || !b) return { ok: false, reason: !b ? "No baseline selected for this family" : "No current campaign" };
    if (c.item.ts === b.item.ts) return { ok: false, reason: "Current and baseline are the same campaign" };
    if (!finite(c.value) || !finite(b.value)) return { ok: false, reason: `No ${!finite(c.value) ? "current" : "baseline"} value: ${(!finite(c.value) ? c : b).reason}` };
    if (c.field.key !== b.field.key) return { ok: false, reason: "Different field scope; contracts differ" };
    const pair = DATA.recordPair(c.record, b.record, c.item.entry, b.item.entry, c.field.key);
    if (!pair.ok) return { ok: false, reason: pair.reason };
    return { ok: true, value: c.value - b.value, relative: b.value === 0 ? null : 100 * (c.value - b.value) / Math.abs(b.value), reason: pair.reason };
  }

  const kindsOf = workflow => [...new Set(workflow.rows.flatMap(row => row.columns.map(col => col.kind)))];
  // Entries before any tracked field existed are not applicable; trim them per kind so x stays shared.
  function applicable(data, workflow, kind, view) {
    const items = data.kinds[kind] ?? [];
    const cols = workflow.rows.flatMap(row => row.columns.filter(col => col.kind === kind).map(col => [row, col]));
    const first = items.findIndex(item => cols.some(([row, col]) => !["absent", "not-in-contract"].includes(point(item, row, col, view).state)));
    return first < 0 ? { items: [], trimmed: items.length } : { items: items.slice(first).map((item, x) => ({ ...item, x })), trimmed: first };
  }

  globalThis.KupuaHistoryModel = { WORKFLOWS, DENSITIES, TOPOLOGY, PHASES, environment, model, resolve, point, segments, delta, applicable, kindsOf };
  if (typeof document === "undefined") return;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (n, unit = "") => !finite(n) ? "—" : `${Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-GB") : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2)}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
  const day = ts => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const stamp = ts => `${day(ts)} ${ts.slice(11, 16)} UTC`;
  const unitOf = (row, col) => col.unit ?? row.unit;
  const histories = () => ({ audit: globalThis.__AUDIT_LOG__, perceived: globalThis.__PERCEIVED_LOG__, density: globalThis.__DENSITY_LOG__ });
  const datasets = {};
  function dataset(kind) {
    if (datasets[kind]) return datasets[kind];
    if (kind === "synthetic") {
      const fixture = globalThis.KupuaHistoryFixtures.build(globalThis.__DENSITY_LOG__);
      return datasets[kind] = { ...model({ density: { entries: fixture.entries } }, true), defaults: { density: fixture.defaultBaseline }, baselineSource: "fixture-designated baseline" };
    }
    const registered = DATA.definitions.find(d => d.id === "proxy-baseline")?.members ?? [];
    return datasets[kind] = { ...model(histories(), false), defaults: Object.fromEntries(registered.map(m => [m.kind, m.timestamp])), baselineSource: "registered proxy baseline" };
  }
  function readView() {
    const p = new URLSearchParams(location.hash.slice(1));
    const pick = (key, allowed, fallback) => allowed.includes(p.get(key)) ? p.get(key) : fallback;
    const wf = pick("view", Object.keys(WORKFLOWS), "scroll");
    const roles = prefix => Object.fromEntries(Object.keys(KINDS).filter(k => p.get(`${prefix}.${k}`)).map(k => [k, p.get(`${prefix}.${k}`)]));
    return { wf, data: WORKFLOWS[wf].synthetic ? pick("h.data", ["recorded", "synthetic"], "recorded") : "recorded",
      dir: pick("h.dir", ["forward", "backward"], "forward"), phase: pick("h.phase", Object.keys(PHASES), "middle"), stat: pick("h.stat", ["median", "p95"], "median"),
      hide: new Set((p.get("h.hide") ?? "").split(",").filter(Boolean)), current: roles("c"), baseline: roles("b"),
      point: p.get("h.point"), table: p.get("h.table") };
  }
  // Keeps the dashboard's checkpoint/baseline params; History owns only h.*, c.* and b.*.
  function hash(view, changes = {}) {
    const v = { ...view, ...changes }, p = new URLSearchParams(location.hash.slice(1));
    for (const key of [...p.keys()]) if (/^(h|c|b)\./.test(key) || ["evidence", "metric", "scenario", "side", "group"].includes(key)) p.delete(key);
    p.set("view", v.wf);
    p.set("mode", "history");
    for (const key of ["data", "dir", "phase", "stat"]) p.set(`h.${key}`, v[key]);
    if (v.hide.size) p.set("h.hide", [...v.hide].sort().join(","));
    for (const [prefix, roles] of [["c", v.current], ["b", v.baseline]]) for (const [k, ts] of Object.entries(roles)) if (ts) p.set(`${prefix}.${k}`, ts);
    if (v.point) p.set("h.point", v.point);
    if (v.table) p.set("h.table", v.table);
    return `#${p}`;
  }
  const withRole = (view, role, kind, ts) => ({ [role]: { ...view[role], [kind]: ts } });
  const pointId = (kind, ts, row, col) => `${kind}~${ts}~${row}~${col}`;
  const domId = id => `pt-${id.replace(/[^\w-]/g, "_")}`;

  function shape(env, x, y) {
    const color = TOPOLOGY[env.topology].color, hollow = env.inferred ? `fill="none" stroke="${color}" stroke-width="1.5"` : `fill="${color}"`;
    if (env.delivery === "canonical") return `<path d="M${x} ${y - 5}L${x + 5} ${y + 4}L${x - 5} ${y + 4}Z" ${hollow}/>`;
    if (env.delivery === "unknown") return `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" ${hollow}/>`;
    return `<circle cx="${x}" cy="${y}" r="4" ${hollow}/>`;
  }
  function describe(p) {
    const unit = unitOf(p.row, p.col);
    const value = finite(p.value) ? fmt(p.value, unit) : p.state === "absent" ? "record absent" : `no value (${p.reason})`;
    return `${p.col.label} ${p.row.title}, ${stamp(p.item.ts)}, ${p.item.env.label}, ${p.revision ? `r${p.revision}` : "contract unknown"}: ${value}`;
  }

  function chart(row, col, points, ctx) {
    const W = 360, L = 44, R = 12, T = 22, B = 120, STRIP = 138, H = 170, n = points.length, unit = unitOf(row, col);
    const X = i => n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1);
    const roles = { C: ctx.current[col.kind], B: ctx.baseline[col.kind] };
    const shown = points.filter(p => !ctx.view.hide.has(p.item.env.id) || p.item.ts === roles.C || p.item.ts === roles.B);
    const max = Math.max(row.reference ?? 0, ...shown.filter(p => finite(p.value)).map(p => p.value), unit === "%" ? 1 : 0.001) * 1.12;
    const Y = v => B - v / max * (B - T);
    const yOf = p => finite(p.value) ? Y(p.value) : STRIP;
    const parts = [`<line x1="${L}" y1="${T}" x2="${L}" y2="${B}" class="axis"/><line x1="${L}" y1="${B}" x2="${W - R}" y2="${B}" class="axis"/>`,
      `<text x="${L - 4}" y="${B + 3}" class="tick" text-anchor="end">0</text><text x="${L - 4}" y="${T + 3}" class="tick" text-anchor="end">${esc(fmt(max, unit === "%" ? "%" : ""))}</text>`,
      `<text x="${L - 4}" y="${STRIP + 3}" class="tick" text-anchor="end">none</text>`];
    if (row.reference) parts.push(`<line x1="${L}" x2="${W - R}" y1="${Y(row.reference)}" y2="${Y(row.reference)}" class="reference"/><text x="${W - R}" y="${Y(row.reference) - 3}" class="tick ref" text-anchor="end">ref ${esc(fmt(row.reference, unit))}</text>`);
    let lastRevision, lastTick = -99;
    const bands = [];
    points.forEach((p, i) => {
      const revision = p.record ? `${p.revision ?? "?"}${p.field?.scope === "journey" && ctx.workflow.controls.includes("phase") && !row.unphased ? " · whole journey" : ""}` : lastRevision;
      if (revision !== lastRevision && revision !== undefined) {
        const x = i === 0 ? L : (X(i - 1) + X(i)) / 2;
        if (i) parts.push(`<line x1="${x}" x2="${x}" y1="${T - 12}" y2="${STRIP + 6}" class="contract"/>`);
        bands.push({ x, revision });
        lastRevision = revision;
      }
      if ((i === 0 || day(p.item.ts) !== day(points[i - 1].item.ts)) && X(i) - lastTick >= 34) {
        parts.push(`<text x="${X(i)}" y="${H - 2}" class="tick" text-anchor="middle">${esc(day(p.item.ts))}</text>`);
        lastTick = X(i);
      }
    });
    bands.forEach(({ x, revision }, i) => {
      const room = (bands[i + 1]?.x ?? W - R) - x, label = room > 5.5 * (revision.length + 1) ? revision : revision.split(" ")[0];
      const tight = room < 14 && i === bands.length - 1;
      parts.push(`<text x="${tight ? x - 3 : x + 3}" y="${T - 12}" class="tick contract-label"${tight ? ' text-anchor="end"' : ""}><title>r${esc(revision)} contract</title>${room >= 14 || tight ? `r${esc(label)}` : ""}</text>`);
    });
    for (const [a, b] of segments(shown)) parts.push(`<line x1="${X(a.item.x)}" y1="${Y(a.value)}" x2="${X(b.item.x)}" y2="${Y(b.value)}" stroke="${TOPOLOGY[a.item.env.topology].color}" class="series"/>`);
    const selected = ctx.view.point?.split("~");
    const focusTs = selected && selected[0] === col.kind && selected[2] === row.id && selected[3] === col.id ? selected[1] : null;
    const focusable = shown.filter(p => p.state !== "not-in-contract");
    const rover = focusable.find(p => p.item.ts === focusTs) ?? focusable.find(p => p.item.ts === roles.C) ?? focusable.at(-1);
    for (const p of focusable) {
      const x = X(p.item.x), y = yOf(p), id = pointId(col.kind, p.item.ts, row.id, col.id);
      const mark = finite(p.value) ? shape(p.item.env, x, y) + (p.value === 0 ? `<text x="${x}" y="${y - 7}" text-anchor="middle" class="tick zero">0</text>` : "")
        : `<text x="${x}" y="${y + 4}" text-anchor="middle" class="glyph" fill="${TOPOLOGY[p.item.env.topology].color}">${GLYPH[p.state] ?? "×"}</text>`;
      parts.push(`<a href="${esc(hash(ctx.view, { point: id }))}" id="${domId(id)}" class="hpt${p.item.ts === focusTs ? " selected" : ""}" tabindex="${p === rover ? 0 : -1}" aria-label="${esc(describe(p))}"><title>${esc(describe(p))}</title><rect x="${x - 7}" y="${y - 8}" width="14" height="16" fill="transparent"/>${mark}</a>`);
    }
    for (const role of ["B", "C"]) {
      const p = points.find(q => q.item.ts === roles[role]);
      if (!p || p.state === "not-in-contract") continue;
      const x = X(p.item.x), y = yOf(p);
      parts.push(role === "C" ? `<path d="M${x} ${y - 10}L${x + 10} ${y}L${x} ${y + 10}L${x - 10} ${y}Z" class="role-current"/><text x="${x + 7}" y="${y - 9}" class="role-label">C</text>`
        : `<circle cx="${x}" cy="${y}" r="9" class="role-baseline"/><text x="${x - 15}" y="${y - 7}" class="role-label">B</text>`);
    }
    return `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(`${col.label} ${row.title} history; arrow keys move between campaigns`)}" data-chart>${parts.join("")}</svg>`;
  }

  function readout(c, b, unit) {
    const value = p => !p ? "—" : finite(p.value) ? fmt(p.value, unit) : p.state === "not-in-contract" ? "not in contract" : (GLYPH[p.state] ?? "×") + " no value";
    const d = delta(c, b);
    return `<span>C ${esc(value(c))} · B ${esc(value(b))}</span>${d.ok ? `<span class="hdelta" title="${esc(d.reason)}">Δ C−B ${d.value > 0 ? "+" : ""}${esc(fmt(d.value, unit === "%" ? "pp" : unit))}${d.relative === null ? " · % n/a, zero baseline" : ` (${d.relative > 0 ? "+" : ""}${d.relative.toFixed(0)}%)`}</span>`
      : `<span class="hdelta muted" title="${esc(d.reason)}">Δ withheld · ${esc(d.reason.length > 60 ? `${d.reason.slice(0, 57)}…` : d.reason)}</span>`}`;
  }

  function evidenceLink(p, ctx) {
    if (!p.record || !p.field || ctx.data.synthetic) return "";
    const member = definition => DATA.definitions.find(d => d.id === definition)?.members.some(m => m.kind === p.item.kind && m.timestamp === p.item.ts);
    const side = member("recorded") ? "" : member("proxy-baseline") ? "baseline" : null;
    if (side === null) return "";
    return `<a href="${esc(DATA.route({ cp: "recorded", base: "proxy-baseline", view: ctx.view.wf, evidence: p.record.id, metric: p.field.key, side, statistic: ctx.view.stat }))}">Open in Compare evidence →</a>`;
  }

  function inspector(ctx) {
    const [kind, ts, rowId, colId] = ctx.view.point?.split("~") ?? [];
    const row = ctx.workflow.rows.find(r => r.id === rowId), col = row?.columns.find(c => c.id === colId && c.kind === kind);
    const item = ctx.items[kind]?.find(i => i.ts === ts);
    if (!item || !col) return "";
    const p = point(item, row, col, ctx.view), raw = p.record?.raw, unit = unitOf(row, col);
    const role = [ts === ctx.current[kind] && "current", ts === ctx.baseline[kind] && "baseline"].filter(Boolean).join(" & ");
    return `<section class="engineering-panel history-inspector" aria-labelledby="inspector-title"><div class="panel-heading"><h2 id="inspector-title" tabindex="-1">${esc(col.label)} · ${esc(row.title)} · ${esc(stamp(ts))}</h2><span>${esc(KINDS[kind])} · ${esc(item.label)}${role ? ` · selected as ${role}` : ""}</span></div>
      <dl class="history-facts"><dt>Environment</dt><dd>${esc(item.env.label)}${item.entry ? ` · ${esc(CMP.label(item.entry))}` : ""}</dd><dt>Record</dt><dd>${p.record ? `<code>${esc(p.record.id)}</code>` : "absent"}</dd>
      <dt>Contract</dt><dd>${raw ? `r${esc(raw.scenarioRevision ?? "unknown")}${raw.profile ? ` · ${esc(raw.profile)}` : ""}${raw.cacheClass ? ` · ${esc(raw.cacheClass)}` : ""}` : "—"}</dd>
      <dt>Field</dt><dd>${p.field ? `<code>${esc(p.field.key)}</code>${PHASES[p.field.scope] ? ` · ${esc(PHASES[p.field.scope])}` : ""}` : esc(p.reason)}</dd>
      <dt>${col.statisticFree ? "Value" : ctx.view.stat === "p95" ? "p95 of observations" : "Median of observations"}</dt><dd>${finite(p.value) ? esc(fmt(p.value, unit)) : `No value · ${esc(p.reason)}`}</dd>
      <dt>Saved field</dt><dd>${p.saved !== undefined ? `<code>${esc(JSON.stringify(p.saved))}</code>${raw.sampleCount !== undefined ? ` · ${esc(raw.sampleCount)} observations` : ""}` : "—"}</dd>
      <dt>Source</dt><dd>${esc(item.entry?.gitSha ?? "unrecorded")}${item.entry?.gitDirty ? " · dirty tree" : ""}${ctx.data.synthetic ? ' · <span class="synthetic">SYNTHETIC</span>' : ""}</dd></dl>
      <div class="history-actions"><a class="button-link" href="${esc(hash(ctx.view, withRole(ctx.view, "current", kind, ts)))}">Set as current</a><a class="button-link" href="${esc(hash(ctx.view, withRole(ctx.view, "baseline", kind, ts)))}">Set as baseline</a>${evidenceLink(p, ctx)}</div>
      ${p.record ? `<details><summary>Complete saved record</summary><pre class="raw-evidence">${esc(JSON.stringify(raw, null, 1))}</pre></details>` : ""}</section>`;
  }

  function table(ctx) {
    const row = ctx.workflow.rows.find(r => r.id === ctx.view.table) ?? ctx.workflow.rows[0];
    const kinds = [...new Set(row.columns.map(c => c.kind))];
    const items = kinds.flatMap(kind => ctx.items[kind]).sort((a, b) => b.ts.localeCompare(a.ts))
      .filter(i => !ctx.view.hide.has(i.env.id) || i.ts === ctx.current[i.kind] || i.ts === ctx.baseline[i.kind]);
    const cell = (item, col) => {
      if (col.kind !== item.kind) return '<td class="muted">—</td>';
      const p = point(item, row, col, ctx.view), unit = unitOf(row, col);
      const text = finite(p.value) ? fmt(p.value, unit) : p.state === "not-in-contract" ? "not in contract" : `${GLYPH[p.state] ?? "×"} ${p.reason}`;
      return `<td class="${p.state}">${p.state === "not-in-contract" ? `<span class="muted">${esc(text)}</span>` : `<a href="${esc(hash(ctx.view, { point: pointId(item.kind, item.ts, row.id, col.id) }))}">${esc(text)}</a>`}</td>`;
    };
    return `<section class="engineering-panel" aria-labelledby="history-table-title"><div class="panel-heading"><h2 id="history-table-title">Evidence table</h2><label class="inline-control">Metric<select data-h="table">${ctx.workflow.rows.map(r => `<option value="${r.id}"${r.id === row.id ? " selected" : ""}>${esc(r.title)}</option>`).join("")}</select></label></div>
      <div class="engineering-table-wrap" tabindex="0" role="region" aria-label="History evidence table"><table class="engineering-table history-table"><caption class="sr-only">${esc(row.title)} by campaign, newest first</caption><thead><tr><th scope="col">Campaign</th><th scope="col">Environment</th><th scope="col">Role</th>${row.columns.map(c => `<th scope="col">${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${items.map(item => `<tr><th scope="row">${esc(stamp(item.ts))}<small>${esc(KINDS[item.kind])} · ${esc(item.label)}</small></th><td><svg class="swatch" viewBox="-6 -6 12 12" aria-hidden="true">${shape(item.env, 0, 0)}</svg> ${esc(item.env.label)}</td><td>${[item.ts === ctx.current[item.kind] && "C", item.ts === ctx.baseline[item.kind] && "B"].filter(Boolean).join(" · ")}</td>${row.columns.map(c => cell(item, c)).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  }

  function render(target) {
    const view = readView(), data = dataset(view.data), workflow = WORKFLOWS[view.wf];
    const kinds = kindsOf(workflow), items = {}, trimmed = {};
    for (const kind of kinds) ({ items: items[kind], trimmed: trimmed[kind] } = applicable(data, workflow, kind, view));
    const known = (kind, ts) => items[kind]?.some(i => i.ts === ts);
    const current = {}, baseline = {};
    for (const kind of kinds) {
      current[kind] = known(kind, view.current[kind]) ? view.current[kind] : items[kind].at(-1)?.ts ?? null;
      baseline[kind] = known(kind, view.baseline[kind]) ? view.baseline[kind] : known(kind, data.defaults[kind]) ? data.defaults[kind] : null;
    }
    const ctx = { view, data, workflow, items, current, baseline };
    const find = (kind, ts) => items[kind].find(i => i.ts === ts);
    const envs = {};
    for (const kind of kinds) for (const i of items[kind]) envs[i.env.id] = { env: i.env, count: (envs[i.env.id]?.count ?? 0) + 1 };
    const select = (key, label, options) => `<label>${label}<select data-h="${key}">${options.map(([v, t]) => `<option value="${v}"${view[key] === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
    const rolePill = (role, kind) => {
      const ts = (role === "Current" ? current : baseline)[kind], explicit = known(kind, (role === "Current" ? view.current : view.baseline)[kind]);
      const reset = hash(view, withRole(view, role === "Current" ? "current" : "baseline", kind, null));
      return `<div class="role-pill"><strong>${role}</strong> ${ts ? `${esc(stamp(ts))} · ${esc(find(kind, ts).env.label)} <small>${esc(find(kind, ts).label)}</small>` : "none"} <span class="pill${explicit ? "" : " muted"}">${explicit ? "pinned" : role === "Current" ? "latest · follows new results" : ts ? data.baselineSource : "no registered baseline"}</span>${explicit ? ` <a href="${esc(reset)}">${role === "Current" ? "Follow latest" : `Use ${esc(data.baselineSource)}`}</a>` : ""}</div>`;
    };
    target.innerHTML = `<div class="engineering-overview history-view">
      <p class="note">History pins current/baseline per result family below; the header checkpoint and baseline apply to Compare.</p>
      ${data.synthetic ? '<p class="note watch synthetic-banner"><strong>SYNTHETIC adverse examples.</strong> Cloned from three real entries and altered for review; not observed history and never comparable with recorded campaigns.</p>' : ""}
      ${kinds.map(kind => {
        const c = current[kind], b = baseline[kind], compare = c && b && c !== b ? CMP.compare(find(kind, c).entry, find(kind, b).entry) : null;
        return `<div class="history-selection" aria-label="${esc(KINDS[kind])} selection"><h2 class="history-kind">${esc(KINDS[kind])} <small>${items[kind].length} campaigns${trimmed[kind] ? ` · ${trimmed[kind]} earlier entries predate these fields` : ""}</small></h2>${rolePill("Current", kind)}${rolePill("Baseline", kind)}${compare ? `<p class="note">${compare.compatible ? "Environments eligible" : "Environments not comparable"}: ${esc(compare.reason)}.</p>` : ""}</div>`;
      }).join("")}
      <div class="scroll-controls history-controls">${workflow.synthetic ? select("data", "History", [["recorded", "Recorded campaigns"], ["synthetic", "SYNTHETIC adverse examples"]]) : ""}${workflow.controls.includes("dir") ? select("dir", "Direction", [["forward", "Forward · D1"], ["backward", "Backward · D2"]]) : ""}${workflow.controls.includes("phase") ? select("phase", "Load phase", Object.entries(PHASES)) : ""}${select("stat", "Statistic", [["median", "Median of observations"], ["p95", "p95 · observed max at small n"]])}</div>
      <fieldset class="history-envs"><legend>Environments · colour = topology, shape = media delivery, hollow = inferred</legend>${Object.values(envs).map(({ env, count }) => `<label><input type="checkbox" data-env="${esc(env.id)}"${view.hide.has(env.id) ? "" : " checked"}><svg class="swatch" viewBox="-6 -6 12 12" aria-hidden="true">${shape(env, 0, 0)}</svg>${esc(env.label)} <small>${count}</small></label>`).join("")}</fieldset>
      <div class="overview-key history-key"><span><svg class="swatch" viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0 -10L10 0L0 10L-10 0Z" class="role-current"/></svg>C current</span><span><svg class="swatch" viewBox="-12 -12 24 24" aria-hidden="true"><circle r="9" class="role-baseline"/></svg>B baseline</span><span>Lines join only consecutive values whose records pass the comparison guard</span><span>Dashed divider · contract revision change</span><span>× no value (censored/unavailable) · ! withheld (invalid/partial/unsupported) · – record absent</span><span>x = campaign order, not elapsed time</span></div>
      ${workflow.rows.map(row => { const uniform = new Set(row.columns.map(col => col.better ?? row.better)).size === 1; return `<section class="engineering-panel history-metric" aria-label="${esc(row.title)} history"><div class="panel-heading"><h2>${esc(row.title)}</h2><span>${esc(row.scope(view))}${uniform ? ` · ${row.columns[0].better ?? row.better} is better` : ""}</span></div><div class="small-multiples">${row.columns.map(col => {
        const points = items[col.kind].map(i => point(i, row, col, view));
        const c = points.find(p => p.item.ts === current[col.kind]), b = points.find(p => p.item.ts === baseline[col.kind]);
        return `<div class="metric-panel"><div class="metric-heading history-heading"><h3>${esc(col.label)}${uniform ? "" : ` <small>${col.better ?? row.better} is better</small>`}</h3>${readout(c, b, unitOf(row, col))}</div>${chart(row, col, points, ctx)}</div>`;
      }).join("")}</div></section>`; }).join("")}
      ${inspector(ctx)}
      ${table(ctx)}
      <details class="panel-method"><summary>Tracked metrics, grouping, selection & honesty rules</summary><p>Only tracked metrics get history; supporting and diagnostic records stay in Compare and exact evidence. Every saved entry is one point; no manual registration and no grouping by label. Selections are per family because families have no shared campaign identity. Current follows the newest result unless pinned; the baseline defaults to the ${esc(data.baselineSource)} and an explicit choice stays pinned in the URL. C−B and lines use the shared environment and record-contract guard; visible together does not mean comparable. Environments of entries saved before environment fields existed are inferred (hollow marks) and never joined. No interpolation, raw trials or confidence intervals.</p></details>
    </div>`;
    const focus = view.point && document.getElementById(domId(view.point));
    if (pendingFocus && focus) focus.focus({ preventScroll: true });
    pendingFocus = false;
  }
  let pendingFocus = false;
  document.addEventListener("change", event => {
    const view = readView(), t = event.target;
    if (t.dataset.h) location.hash = hash(view, t.dataset.h === "data" ? { data: t.value, current: {}, baseline: {}, point: null } : { [t.dataset.h]: t.value });
    else if (t.dataset.env) { const hide = new Set(view.hide); t.checked ? hide.delete(t.dataset.env) : hide.add(t.dataset.env); location.hash = hash(view, { hide }); }
  });
  document.addEventListener("click", event => { if (event.target.closest?.("a.hpt")) pendingFocus = true; });
  document.addEventListener("keydown", event => {
    const a = event.target.closest?.("a.hpt");
    if (!a) return;
    if (event.key === "Enter") { pendingFocus = true; return; }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const all = [...a.closest("svg").querySelectorAll("a.hpt")], i = all.indexOf(a);
    const next = all[event.key === "Home" ? 0 : event.key === "End" ? all.length - 1 : Math.max(0, Math.min(all.length - 1, i + (event.key === "ArrowLeft" ? -1 : 1)))];
    event.preventDefault();
    all.forEach(el => el.setAttribute("tabindex", el === next ? "0" : "-1"));
    next.focus();
  });
  globalThis.KupuaHistory = { render, synthetic: () => readView().data === "synthetic" };
})();
