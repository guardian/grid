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
const fixtureEnv = {
  KUPUA_ES_URL: "http://127.0.0.1:9220", VITE_ES_IS_LOCAL: "true", VITE_ES_INDEX: "images",
  VITE_ES_BASE: "/es", VITE_MEDIA_DELIVERY: "proxy", VITE_HOSTED: "false",
  VITE_S3_PROXY_ENABLED: "false", VITE_IMGPROXY_ENABLED: "false", VITE_IMAGE_BUCKET: "",
  VITE_USE_MEDIA_API: "false", KUPUA_LOAD_SITE_SETTINGS: "false",
};

export default defineConfig({
  metadata: { syntheticLocalE2E: true },
  testDir: "./e2e/local",
  testMatch: "**/*.spec.ts",

  /* Verify ES + sample data before starting any tests.
   * Fails fast with a clear message instead of 46 individual timeouts. */
  globalSetup: "./e2e/global-setup.ts",

  /* Each test gets up to 60s — scrubber seeks are async */
  timeout: 60_000,

  /* Hard limit for entire test run — prevents hanging forever.
   * 235 tests with seek, extend, and scroll operations take ~6-10 min on
   * local Docker ES. 20 min gives comfortable headroom including retries. */
  globalTimeout: 20 * 60_000,

  /* Retry flaky tests once */
  retries: 1,

  /* Four workers shorten the validated local run without dropping coverage.
   * Use --workers=3 on machines where browser/ES contention is higher. */
  workers: 4,

  /* Reporter */
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: "http://localhost:3020",
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
      testIgnore: ["**/forced-seek.spec.ts", "**/justified-density.spec.ts", "**/justified-windowed.spec.ts"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "forced-seek",
      testMatch: "**/forced-seek.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3030" },
    },
    {
      name: "justified-preview",
      testMatch: "**/justified-density.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3040" },
    },
    {
      name: "justified-indexed",
      testMatch: "**/justified-windowed.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3020" },
    },
    {
      name: "justified-seek",
      testMatch: "**/justified-windowed.spec.ts",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3030" },
    },
  ],

  /* Auto-start the normal app and one isolated forced-seek app. */
  webServer: [
    {
      command: "npm run dev -- --port 3020 --strictPort",
      port: 3020,
      env: { ...fixtureEnv, KUPUA_E2E_CACHE_DIR: "node_modules/.cache/vite-e2e-3020" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "VITE_POSITION_MAP_THRESHOLD=0 npm run dev -- --port 3030 --strictPort",
      env: { ...fixtureEnv, KUPUA_E2E_CACHE_DIR: "node_modules/.cache/vite-e2e-3030" },
      port: 3030,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev:justified -- --strictPort",
      env: { ...fixtureEnv, KUPUA_E2E_CACHE_DIR: "node_modules/.cache/vite-e2e-3040" },
      port: 3040,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
