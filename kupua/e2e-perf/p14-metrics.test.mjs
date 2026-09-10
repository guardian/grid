import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAspectRatioChange,
  deriveNavigationTiming,
  landingElapsedMs,
  metricsAreComparable,
  severeRateIsReportable,
  sanitizeLayoutShift,
} from "./p14-metrics.mjs";

test("measures landing from the final committed navigation", () => {
  assert.equal(landingElapsedMs(1_250, 1_600), 350);
  assert.equal(landingElapsedMs(1_250, 1_200), 0);
});

test("classifies aspect-ratio changes without retaining identity", () => {
  assert.equal(classifyAspectRatioChange(
    { width: 400, height: 200 },
    { width: 800, height: 400 },
  ), "same");
  assert.equal(classifyAspectRatioChange(
    { width: 400, height: 200 },
    { width: 200, height: 400 },
  ), "changed");
  assert.equal(classifyAspectRatioChange(
    { width: 0, height: 0 },
    { width: 200, height: 400 },
  ), "unknown");
});

test("sanitizes layout shifts into phase, role, geometry and ratio class", () => {
  const sanitized = sanitizeLayoutShift({
    value: 0.12,
    hadRecentInput: false,
    time: 1_450,
    sources: [{
      role: "detail-image",
      previousRect: { x: 10, y: 20, width: 400, height: 200 },
      currentRect: { x: 20, y: 25, width: 200, height: 400 },
      unsafeIdentity: "must-not-survive",
    }],
  }, 1_500);

  assert.deepEqual(sanitized, {
    value: 0.12,
    phase: "traversal",
    sources: [{
      role: "detail-image",
      previousRect: { x: 10, y: 20, width: 400, height: 200 },
      currentRect: { x: 20, y: 25, width: 200, height: 400 },
      aspectRatioClass: "changed",
    }],
  });
  assert.equal(JSON.stringify(sanitized).includes("must-not-survive"), false);
});

test("rejects comparisons across scenario revisions", () => {
  assert.equal(metricsAreComparable(
    { scenarioRevision: 2, cacheClass: "fresh-browser-context" },
    { scenarioRevision: 2, cacheClass: "fresh-browser-context" },
  ), true);
  assert.equal(metricsAreComparable(
    { scenarioRevision: 2, cacheClass: "fresh-browser-context" },
    {},
  ), false);
  assert.equal(metricsAreComparable(
    { scenarioRevision: 2, cacheClass: "fresh-browser-context" },
    { scenarioRevision: 2, cacheClass: "warm" },
  ), false);
});

test("derives bounded navigation milestones from browser timing", () => {
  assert.deepEqual(deriveNavigationTiming({
    domContentLoadedEventEnd: 320,
    loadEventEnd: 480,
    responseEnd: 140,
  }, [
    { name: "first-paint", startTime: 210 },
    { name: "first-contentful-paint", startTime: 230 },
  ]), {
    responseEndMs: 140,
    domContentLoadedMs: 320,
    loadEventMs: 480,
    firstPaintMs: 210,
    firstContentfulPaintMs: 230,
  });
});

test("reports severe rate only for sustained frame windows", () => {
  assert.equal(severeRateIsReportable({ frameCount: 29 }), false);
  assert.equal(severeRateIsReportable({ frameCount: 30 }), true);
  assert.equal(severeRateIsReportable({}), false);
});