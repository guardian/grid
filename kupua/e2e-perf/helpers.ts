import { writeFileSync } from "node:fs";

import { test as sharedTest, expect } from "../e2e/shared/helpers";

export const test = sharedTest.extend<{ perfEnvironment: void }>({
  perfEnvironment: [async ({ kupua, browserName }, use) => {
    await use();

    const outputFile = process.env.KUPUA_PERF_ENV_FILE;
    if (!outputFile) return;

    const response = await kupua.page.request.get("/__kupua/perf-environment");
    if (!response.ok()) {
      throw new Error(`Perf environment endpoint returned HTTP ${response.status()}`);
    }

    const appEnvironment = await response.json();
    const browser = kupua.page.context().browser();
    const browserEnvironment = await kupua.page.evaluate(() => ({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      screen: { width: window.screen.width, height: window.screen.height },
      deviceScaleFactor: window.devicePixelRatio,
      appBaseUrl: window.location.origin,
    }));

    writeFileSync(outputFile, JSON.stringify({
      dataMode: appEnvironment.dataMode,
      browserName,
      browserVersion: browser?.version() ?? "unknown",
      ...browserEnvironment,
    }) + "\n");
  }, { auto: true }],
});

export { expect };
