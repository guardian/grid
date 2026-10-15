import { defineConfig } from "@playwright/test";

/** Deterministic in-memory observer validation, not a performance campaign. No app/server/ES. */
export default defineConfig({
  testDir: ".",
  testMatch: ["density-fixtures.spec.ts", "dashboard-navigation.spec.ts"],
  outputDir: "../test-results/density-fixtures",
  timeout: 15000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { headless: true, viewport: { width: 800, height: 600 }, trace: "off", screenshot: "off", video: "off" },
});
