/**
 * Playwright config for perceived-performance journey tests.
 *
 * Companion to playwright.perceived-short.config.ts — same settings, different testMatch.
 * Runs only perceived-long.spec.ts.
 *
 * Long-form perceived tests are multi-step, chained scenarios that simulate
 * realistic user workflows against real ES. Each step emits a PerceivedMetrics
 * entry; the harness aggregates them the same way as perceived-short.spec.ts.
 *
 * Invoked by:
 *   node e2e-perf/run-audit.mjs --long-perceived-only --label "..."
 *
 * MANUAL ONLY — never invoked by CI.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["**/perceived-long.spec.ts"],

  timeout: 180_000,
  globalTimeout: 60 * 60_000,

  retries: 0,
  workers: 1,

  reporter: [
    ["list"],
  ],

  use: {
    baseURL: "http://localhost:3000",
    headless: false,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    video: "off",
    trace: "off",
    /* Same viewport as playwright.perceived.config.ts — independent of perf.config.ts. */
    viewport: { width: 1720, height: 960 },
    deviceScaleFactor: 2,
  },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
