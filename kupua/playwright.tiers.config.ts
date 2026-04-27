import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the cross-tier E2E test matrix.
 *
 * Runs ~18 tier-sensitive tests across all three scrolling tiers:
 * - **buffer** (SCROLL_MODE_THRESHOLD=15000): all 10k docs eagerly loaded
 * - **two-tier** (default thresholds): position map + sliding buffer
 * - **seek** (POSITION_MAP_THRESHOLD=0): scrubber = seek control, teleport on release
 *
 * Each tier runs on its own Vite dev server (env vars are inlined at build time).
 *
 * Usage:
 *   npx playwright test --config playwright.tiers.config.ts 2>&1 | tee /tmp/tier-matrix-results.txt
 *   npm run test:e2e:tiers
 *
 * NOT part of the habitual test suite — run manually before merges or after
 * tier-sensitive changes.
 */

const sharedUse = {
  headless: true,
  actionTimeout: 10_000,
  navigationTimeout: 15_000,
  screenshot: "only-on-failure" as const,
  trace: "retain-on-failure" as const,
  viewport: { width: 1400, height: 900 },
};

export default defineConfig({
  testDir: "./e2e/local",
  testMatch: ["tier-matrix.spec.ts", "drift-flash-matrix.spec.ts"],
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  globalTimeout: 30 * 60_000, // 30min — 3 tiers × ~10min
  retries: 1,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],

  projects: [
    {
      name: "tier-buffer",
      use: { ...devices["Desktop Chrome"], ...sharedUse, baseURL: "http://localhost:3010" },
    },
    {
      name: "tier-two-tier",
      use: { ...devices["Desktop Chrome"], ...sharedUse, baseURL: "http://localhost:3020" },
    },
    {
      name: "tier-seek",
      use: { ...devices["Desktop Chrome"], ...sharedUse, baseURL: "http://localhost:3030" },
    },
  ],

  webServer: [
    {
      command: "VITE_SCROLL_MODE_THRESHOLD=15000 npm run dev -- --port 3010",
      port: 3010,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --port 3020",
      port: 3020,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "VITE_POSITION_MAP_THRESHOLD=0 npm run dev -- --port 3030",
      port: 3030,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

