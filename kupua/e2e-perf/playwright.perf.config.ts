/**
 * Playwright config for rendering performance smoke tests.
 *
 * Runs ONLY perf.spec.ts — narrowed from the old playwright.smoke.config.ts
 * which ran both manual-smoke-test.spec.ts and rendering-perf-smoke.spec.ts.
 *
 * Key differences from the main playwright.config.ts:
 * - testDir is ./e2e-perf (this directory)
 * - No globalSetup — real ES doesn't need the local ES health check
 * - Always headed (so the developer can watch)
 * - Longer timeouts (real cluster + SSH tunnel)
 * - JSON reporter + list reporter (JSON feed the audit harness)
 *
 * Invoked by:
 *   node e2e-perf/run-audit.mjs --label "..."
 * or directly:
 *   npx playwright test --config=e2e-perf/playwright.perf.config.ts
 *
 * MANUAL ONLY — never invoked by CI.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["**/perf.spec.ts", "**/selection-stress.spec.ts"],

  /* No globalSetup — we don't want the local ES health check.
   * The perf tests themselves check total > 100k and skip if local. */

  /* Generous timeouts for real cluster + SSH tunnel */
  timeout: 240_000,
  globalTimeout: 60 * 60_000,

  /* No retries — we want to see real failure */
  retries: 0,

  workers: 1,

  reporter: [
    ["list"],
    ["json", { outputFile: "e2e-perf/results/.playwright-report.json" }],
  ],

  use: {
    baseURL: "http://localhost:3000",
    headless: false,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    /* Original baseline viewport — all existing results were measured here.
       Do NOT change without re-baselining. 1987×1110 @1.25x approximates
       a large-monitor CSS layout. Independent of playwright.perceived.config.ts. */
    viewport: { width: 1987, height: 1110 },
    deviceScaleFactor: 1.25,
    deviceScaleFactor: 2,
  },

  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        /* Do NOT spread ...devices["Desktop Chrome"] — it overrides
           viewport and deviceScaleFactor with its own defaults. */
      },
    },
  ],

  /* Don't auto-start a web server — the user already has start.sh --use-TEST running */
});

