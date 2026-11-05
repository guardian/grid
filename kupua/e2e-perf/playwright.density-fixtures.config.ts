import { defineConfig } from "@playwright/test";

/** Isolated observer/mechanism validation, not a campaign. No app/ES; some fixtures own loopback HTTP servers. */
export default defineConfig({
  testDir: "./validation",
  testMatch: ["density-fixtures.spec.ts", "dashboard-navigation.spec.ts"],
  outputDir: "../test-results/density-fixtures",
  timeout: 15000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { headless: true, viewport: { width: 800, height: 600 }, trace: "off", screenshot: "off", video: "off" },
});
