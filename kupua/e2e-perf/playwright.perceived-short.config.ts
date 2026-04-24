/**
 * Playwright config for perceived-performance smoke tests.
 *
 * Companion to playwright.perf.config.ts — same settings, different testMatch.
 * Runs only perceived-short.spec.ts.
 *
 * Invoked by:
 *   node e2e-perf/run-audit.mjs --perceived --label "..."
 *   node e2e-perf/run-audit.mjs --short-perceived-only --label "..."
 *
 * MANUAL ONLY — never invoked by CI.
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["**/perceived-short.spec.ts"],

  timeout: 120_000,
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
    /* MacBook Pro 14" — 1720×960 CSS px gives comfortable viewing room.
       Independent of playwright.perf.config.ts — do NOT sync these. */
    viewport: { width: 1720, height: 960 },
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
});
