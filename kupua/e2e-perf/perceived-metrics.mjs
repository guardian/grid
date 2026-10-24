export function computeCorrelatedMetrics({
  id,
  label,
  action,
  requiredPhases,
  entries,
  timeField = "t",
}) {
  const starts = entries.filter(
    (entry) => entry.action === action && entry.phase === "t_0" && entry.interactionId,
  );
  if (starts.length !== 1 || !starts[0].interactionId) {
    throw new Error(`${id} requires exactly one correlated ${action} t_0`);
  }

  const interactionId = starts[0].interactionId;
  const correlated = entries.filter((entry) => entry.interactionId === interactionId);
  const phaseEntries = new Map();
  for (const entry of correlated) {
    const matches = phaseEntries.get(entry.phase) ?? [];
    matches.push(entry);
    phaseEntries.set(entry.phase, matches);
  }

  const problems = [];
  for (const phase of requiredPhases) {
    const count = phaseEntries.get(phase)?.length ?? 0;
    if (count === 0) problems.push(`missing ${phase}`);
    if (count > 1) problems.push(`duplicate ${phase}`);
  }
  if (problems.length) {
    throw new Error(`${id} correlated phases invalid: ${problems.join(", ")}`);
  }

  const t0 = starts[0][timeField];
  if (!Number.isFinite(t0)) throw new Error(`${id} correlated t_0 has no ${timeField}`);
  for (const entry of correlated) {
    const timestamp = entry[timeField];
    if (!Number.isFinite(timestamp)) {
      throw new Error(`${id} correlated ${entry.phase} has no finite ${timeField}`);
    }
    if (entry.phase !== "t_0" && timestamp < t0) {
      throw new Error(`${id} correlated ${entry.phase} is before t_0`);
    }
  }
  const elapsed = (phase) => {
    const entry = phaseEntries.get(phase)?.[0];
    return entry ? Math.round(entry[timeField] - t0) : null;
  };
  const statusEntry = phaseEntries.get("t_status_visible")?.[0]
    ?? phaseEntries.get("t_seeking")?.[0];
  const terminalEntry = phaseEntries.get("t_visual_settled")?.[0]
    ?? phaseEntries.get("t_store_ready")?.[0];
  if (statusEntry && terminalEntry && terminalEntry[timeField] < statusEntry[timeField]) {
    throw new Error(`${id} correlated ${terminalEntry.phase} is before ${statusEntry.phase}`);
  }
  const firstVisible = elapsed("t_first_visible_frame");
  const visualSettled = elapsed("t_visual_settled");

  return {
    id,
    label,
    action,
    interactionId,
    dt_ack_ms: elapsed("t_ack"),
    dt_status_ms: statusEntry ? Math.round(statusEntry[timeField] - t0) : null,
    dt_native_exit_ms: elapsed("t_native_exit"),
    dt_store_ready_ms: elapsed("t_store_ready"),
    dt_first_visible_frame_ms: firstVisible,
    dt_visual_settled_ms: visualSettled,
    status_total_ms: statusEntry && terminalEntry
      ? Math.round(terminalEntry[timeField] - statusEntry[timeField])
      : null,
    raw: entries,
  };
}

export function ownsDataRoute(routes) {
  return Array.isArray(routes)
    && routes.some((route) => route === "direct-es" || route === "media-api");
}