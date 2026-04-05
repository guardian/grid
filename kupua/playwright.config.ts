import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for kupua E2E tests.
 *
 * Requires:
 * - Local ES running on port 9220 with sample data loaded
 * - Vite dev server started (auto-started by webServer config below)
 *
 * Orchestration:
 *   Full lifecycle (docker + ES + data + tests):
 *     ./scripts/run-e2e.sh         or   npm run test:e2e:full
 *
 *   Tests only (assumes ES + data already up):
 *     npx playwright test           or   npm run test:e2e
 *
 *   Interactive:
 *     npx playwright test --headed       (visible browser)
 *     npx playwright test --debug        (step-through debugger)
 *     npx playwright test --ui           (Playwright UI mode)
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  /* Manual smoke tests (real ES) and perf tests (own config) are excluded.
   * Run via: node scripts/run-smoke.mjs  or  node e2e-perf/run-audit.mjs */
  testIgnore: ["**/manual-smoke-test.spec.ts", "**/smoke-scroll-stability.spec.ts", "**/e2e-perf/**", "**/scrubber-debug.spec.ts"],

  /* Verify ES + sample data before starting any tests.
   * Fails fast with a clear message instead of 46 individual timeouts. */
  globalSetup: "./e2e/global-setup.ts",

  /* Each test gets up to 60s — scrubber seeks are async */
  timeout: 60_000,

  /* Hard limit for entire test run — prevents hanging forever.
   * 46 tests take ~70s locally; 5 min is generous headroom. */
  globalTimeout: 5 * 60_000,

  /* Retry flaky tests once */
  retries: 1,

  /* Single worker — tests share one ES instance and sequential seeks
   * can race if parallelised. Keeps behaviour deterministic. */
  workers: 1,

  /* Reporter */
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: "http://localhost:3000",
    /* Headless by default; use --headed for debugging */
    headless: true,
    /* Per-action timeout (click, fill, etc.) — catches hung selectors */
    actionTimeout: 10_000,
    /* Navigation timeout — page.goto, waitForNavigation */
    navigationTimeout: 15_000,
    /* Capture screenshots and traces on failure */
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    /* Larger viewport so the grid shows enough columns */
    viewport: { width: 1400, height: 900 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Auto-start vite dev server if not already running */
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
    /* Give Vite time to start + ES proxy to connect.
     * If ES isn't running, Vite starts but the proxy fails silently —
     * tests will fail on first page load with "store not exposed".
     * run-e2e.sh prevents this by checking ES before invoking Playwright. */
    timeout: 60_000,
  },
});
