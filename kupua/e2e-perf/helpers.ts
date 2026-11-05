import { writeFileSync } from "node:fs";

import { test as sharedTest, expect } from "../e2e/shared/helpers";
import { DEPLOYED_TEST_MEDIA_API_BASE_URL } from "../src/dal/grid-api/proxy-target";
import { createPerfAuthGuard, type PerfAuthGuard } from "./auth-failure.mjs";

export const test = sharedTest.extend<{ perfAuth: PerfAuthGuard | null; perfEnvironment: void }>({
  perfAuth: [async ({ kupua }, use) => {
    if (!process.env.KUPUA_PERF_AUTH_FILE) {
      await use(null);
      return;
    }
    const guard = createPerfAuthGuard(kupua.page, {
      appBaseUrl: process.env.KUPUA_PERF_BASE_URL ?? "http://localhost:3000",
      mediaApiBaseUrl: DEPLOYED_TEST_MEDIA_API_BASE_URL,
    }, marker => console.log(marker));
    try {
      await use(guard);
    } finally {
      guard.dispose();
      guard.assertAuthenticated();
    }
  }, { auto: true }],
  perfEnvironment: [async ({ kupua, browserName, perfAuth }, use) => {
    const outputFile = process.env.KUPUA_PERF_ENV_FILE;
    if (!outputFile) {
      await use();
      return;
    }

    const response = await kupua.page.request.get("/__kupua/perf-environment", { maxRedirects: 0 });
    perfAuth?.inspect(response);
    perfAuth?.assertAuthenticated();
    if (!response.ok()) {
      throw new Error(`Perf environment endpoint returned HTTP ${response.status()}`);
    }

    const appEnvironment = await response.json();
    const expectedDelivery = process.env.KUPUA_PERF_MEDIA_DELIVERY;
    if (expectedDelivery && appEnvironment.mediaDelivery !== expectedDelivery) {
      throw new Error(`App media delivery mismatch: requested ${expectedDelivery}, observed ${appEnvironment.mediaDelivery ?? "unknown"}`);
    }
    await use();
    const after = await kupua.page.request.get("/__kupua/perf-environment", { maxRedirects: 0 });
    perfAuth?.inspect(after);
    perfAuth?.assertAuthenticated();
    if (!after.ok() || JSON.stringify(await after.json()) !== JSON.stringify(appEnvironment)) {
      throw new Error("App perf environment changed during the workload");
    }
    const browser = kupua.page.context().browser();
    const browserEnvironment = await kupua.page.evaluate(() => ({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      screen: { width: window.screen.width, height: window.screen.height },
      deviceScaleFactor: window.devicePixelRatio,
      appBaseUrl: window.location.origin,
    }));

    writeFileSync(outputFile, JSON.stringify({
      dataMode: appEnvironment.dataMode,
      apiTopology: appEnvironment.apiTopology,
      mediaDelivery: appEnvironment.mediaDelivery,
      browserName,
      browserVersion: browser?.version() ?? "unknown",
      ...browserEnvironment,
    }) + "\n");
  }, { auto: true }],
});

export function isMediaApiUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl);
  return url.pathname === "/api"
    || url.pathname.startsWith("/api/")
    || url.origin === DEPLOYED_TEST_MEDIA_API_BASE_URL;
}

export { expect };
