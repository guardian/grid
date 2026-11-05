import { defineConfig } from "@playwright/test";
import existing from "./playwright.perf.config";

// Playwright otherwise saves an accessibility snapshot containing live image metadata on failure.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

/** Operator-only additive suite; never substitutes historical workloads. */
export default defineConfig({
  ...existing,
  testMatch: ["**/density.spec.ts"],
  maxFailures: 1,
  use: { ...existing.use, screenshot: "off", trace: "off", video: "off" },
  reporter: [["list"], ["./teardown-reporter.mjs"], ["json", { outputFile: "results/.density-playwright-report.json" }]],
});
