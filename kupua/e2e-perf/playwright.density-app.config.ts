import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "validation/density-app-fixtures.spec.ts",
  outputDir: "../test-results/density-app-fixtures",
  timeout: 60000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3041", headless: true, viewport: { width: 1720, height: 960 },
    trace: "off", screenshot: "off", video: "off" },
  webServer: {
    command: "KUPUA_ES_URL=http://127.0.0.1:9220 VITE_ES_IS_LOCAL=true VITE_USE_MEDIA_API=false VITE_JUSTIFIED_PREVIEW= VITE_POSITION_MAP_THRESHOLD=65000 npm run dev -- --host 127.0.0.1 --port 3041 --strictPort",
    url: "http://127.0.0.1:3041",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
