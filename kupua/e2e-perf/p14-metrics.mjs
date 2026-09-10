function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function sanitizeRect(rect) {
  return {
    x: Math.round(finite(rect?.x, "rect.x")),
    y: Math.round(finite(rect?.y, "rect.y")),
    width: Math.round(finite(rect?.width, "rect.width")),
    height: Math.round(finite(rect?.height, "rect.height")),
  };
}

export function deriveNavigationTiming(navigation, paintEntries) {
  const paintByName = new Map(paintEntries.map((entry) => [entry.name, entry.startTime]));
  return {
    responseEndMs: Math.round(finite(navigation.responseEnd, "navigation.responseEnd")),
    domContentLoadedMs: Math.round(finite(
      navigation.domContentLoadedEventEnd,
      "navigation.domContentLoadedEventEnd",
    )),
    loadEventMs: Math.round(finite(navigation.loadEventEnd, "navigation.loadEventEnd")),
    firstPaintMs: Math.round(finite(paintByName.get("first-paint"), "first-paint")),
    firstContentfulPaintMs: Math.round(finite(
      paintByName.get("first-contentful-paint"),
      "first-contentful-paint",
    )),
  };
}

export function landingElapsedMs(finalCommitEpochMs, renderedEpochMs) {
  return Math.max(0, Math.round(
    finite(renderedEpochMs, "renderedEpochMs")
      - finite(finalCommitEpochMs, "finalCommitEpochMs"),
  ));
}

export function classifyAspectRatioChange(previousRect, currentRect) {
  if (
    !previousRect?.width || !previousRect?.height
    || !currentRect?.width || !currentRect?.height
  ) return "unknown";
  const previous = previousRect.width / previousRect.height;
  const current = currentRect.width / currentRect.height;
  return Math.abs(previous - current) <= 0.01 ? "same" : "changed";
}

export function sanitizeLayoutShift(shift, finalCommitTime) {
  return {
    value: finite(shift.value, "layout shift value"),
    phase: shift.time < finalCommitTime ? "traversal" : "landing",
    sources: (shift.sources ?? []).map((source) => ({
      role: source.role ?? "other",
      previousRect: sanitizeRect(source.previousRect),
      currentRect: sanitizeRect(source.currentRect),
      aspectRatioClass: classifyAspectRatioChange(
        source.previousRect,
        source.currentRect,
      ),
    })),
  };
}

export function metricsAreComparable(current, previous) {
  const fields = ["scenarioRevision", "cacheClass"];
  return fields.every((field) =>
    current?.[field] != null
    && previous?.[field] != null
    && current[field] === previous[field]
  );
}

export function severeRateIsReportable(metric) {
  return Number.isFinite(metric?.frameCount) && metric.frameCount >= 30;
}