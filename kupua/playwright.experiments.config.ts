/**
 * Playwright config for tuning experiments.
 *
 * Runs experiment specs from e2e-perf/ against either local or real ES.
 * Unlike the main config:
 * - No globalSetup safety gate (experiments may target TEST via --use-TEST)
 * - Headed browser by default (human watches while agent drives)
 * - Longer timeouts (real cluster + SSH tunnel)
 * - No auto-start webServer (assumes start.sh is already running)
 *
 * Usage:
 *   # Against local ES (10k docs):
 *   npx playwright test --config playwright.experiments.config.ts
 *
 *   # Against TEST ES (1.3M docs) — human must start.sh --use-TEST first:
 *   npx playwright test --config playwright.experiments.config.ts
 *
 *   # Run specific experiment:
 *   npx playwright test --config playwright.experiments.config.ts -g "E1"
 *
 * SAFETY: This config allows running against real ES. The experiment specs
 * are read-only (search + aggregation only). No writes, no index mutations.
 * The agent must ALWAYS ask the human before starting an experiment session.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-perf",
  testMatch: ["**/experiments.spec.ts"],

  /* No globalSetup — experiments may run against TEST. The spec itself
   * logs the ES source and total for traceability. */

  /* Generous timeouts for real cluster + SSH tunnel */
  timeout: 120_000,
  globalTimeout: 30 * 60_000, // experiments can be long

  /* No retries — we want raw numbers, not second-chance averages */
  retries: 0,

  workers: 1,

  reporter: [["list"]],

  use: {
    baseURL: "http://localhost:3000",
    /* Headed so the human can observe visual artefacts */
    headless: false,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    /* Match perf tests exactly — MacBook Pro Retina measured from developer's
       actual browser: window.innerWidth=1987, innerHeight=1110, DPR=1.25.
       Different viewport = different virtualizer row counts, columns, and
       scroll geometry — results would not be comparable with perf baselines. */
    viewport: { width: 1987, height: 1110 },
    deviceScaleFactor: 1.25,
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

  /* No webServer — assume start.sh (local or --use-TEST) is running */
});


