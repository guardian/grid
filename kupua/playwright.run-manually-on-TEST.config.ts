/**
 * Playwright config for buffer-corruption regression tests.
 *
 * Runs ONLY the buffer-corruption spec. Unlike the main config:
 * - No globalSetup (no local ES health check — works against any ES)
 * - No testIgnore filter
 * - Longer timeouts (real cluster has more data → seeks take longer)
 *
 * Usage:
 *   npx playwright test --config playwright.buffer-corruption.config.ts
 *   npx playwright test --config playwright.buffer-corruption.config.ts --headed
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/local",
  testMatch: ["**/buffer-corruption.spec.ts"],

  /* No globalSetup — skip local ES health check.
   * The tests themselves skip gracefully if total < MIN_TOTAL_FOR_SEEK. */

  timeout: 60_000,
  globalTimeout: 5 * 60_000,

  retries: 0,  // No retries — we want to see the real result
  workers: 1,

  reporter: [["list"]],

  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1400, height: 900 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Don't auto-start a web server — assume the user has one running
   * (either local dev or start.sh --use-TEST). */
});

