import { writeFileSync } from "node:fs";
import type { Request, Response } from "@playwright/test";

import { test as sharedTest, expect } from "../e2e/shared/helpers";
import { DEPLOYED_TEST_MEDIA_API_BASE_URL } from "../src/dal/grid-api/proxy-target";
import { createPerfAuthGuard, type PerfAuthGuard } from "./auth-failure.mjs";
import type { KupuaHelpers } from "../e2e/shared/helpers";
import { createPageIntegrityGuard } from "./runner-runtime.mjs";

export function observeDetailMediaRequests(page: KupuaHelpers["page"]) {
  type MediaRequest = { status?: number; finished?: boolean; failure?: string; next?: MediaRequest };
  const requests = new Map<string, MediaRequest>();
  const byRequest = new WeakMap<Request, MediaRequest>();
  let truncated = false;
  const onRequest = (request: Request) => {
    if (request.resourceType() !== "image") return;
    const url = request.url();
    if (!requests.has(url) && requests.size >= 512) {
      truncated = true;
      return;
    }
    const observed = {};
    requests.set(url, observed);
    byRequest.set(request, observed);
    const redirectedFrom = request.redirectedFrom();
    const preceding = redirectedFrom && byRequest.get(redirectedFrom);
    if (preceding) preceding.next = observed;
  };
  const onResponse = (response: Response) => {
    const observed = byRequest.get(response.request());
    if (observed) observed.status = response.status();
  };
  const onFinished = (request: Request) => {
    const observed = byRequest.get(request);
    if (observed) observed.finished = true;
  };
  const onFailed = (request: Request) => {
    const observed = byRequest.get(request);
    if (!observed) return;
    const code = request.failure()?.errorText ?? "";
    observed.failure = /^net::ERR_[A-Z0-9_]+$/.test(code) ? code : "unknown";
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfinished", onFinished);
  page.on("requestfailed", onFailed);
  return {
    async summarize() {
      const media = await page.evaluate(() => {
        const image = document.querySelector<HTMLImageElement>('[data-detail-image-id] img[fetchpriority="high"]');
        return image ? { candidate: image.src, complete: image.complete, sized: image.naturalWidth > 0 } : null;
      });
      let request = media?.candidate ? requests.get(media.candidate) : undefined;
      while (request?.next) request = request.next;
      const state = !request ? "not-observed" : request.failure ? "failed" : request.finished ? "finished"
        : request.status === undefined ? "awaiting-headers" : "awaiting-body";
      return { state, status: request?.status ?? null, failure: request?.failure ?? null,
        imageComplete: media?.complete ?? null, imageSized: media?.sized ?? null, truncated };
    },
    stop() {
      page.off("request", onRequest);
      page.off("response", onResponse);
      page.off("requestfinished", onFinished);
      page.off("requestfailed", onFailed);
      requests.clear();
    },
  };
}

export function beginPerfMeasurement(id: string) {
  test.info().annotations.push({ type: "perf-active", description: id });
}

export async function waitForPerfResults(kupua: KupuaHelpers, timeout = 15_000, density?: "grid" | "table") {
  const result = await kupua.page.waitForFunction((density) => {
    const state = (window as any).__kupua_store__?.getState();
    if (state && !state.loading && state.error && state.results.length === 0) return "required-data-error";
    const grid = document.querySelector('[aria-label="Image results grid"]');
    const table = document.querySelector('[aria-label="Image results table"]');
    const container = density === "grid" ? grid : density === "table" ? table : grid ?? table;
    if (!container) return false;
    const bounds = container.getBoundingClientRect();
    return Array.from(container.querySelectorAll("[data-image-id]")).some(item => {
      const rect = item.getBoundingClientRect();
      return rect.bottom > bounds.top && rect.top < bounds.bottom;
    });
  }, density, { timeout });
  try {
    if (await result.jsonValue() === "required-data-error") throw new Error("Required search data unavailable (settled error with no results)");
  } finally { await result.dispose(); }
}

export const test = sharedTest.extend<{ perfReadiness: void; perfIntegrity: void; perfAuth: PerfAuthGuard | null; perfEnvironment: void }>({
  perfIntegrity: [async ({ kupua }, use, testInfo) => {
    const guard = await createPageIntegrityGuard(kupua.page);
    try { await use(); }
    finally {
      await guard.dispose();
      if (guard.reason) testInfo.annotations.push({ type: "perf-failure", description: guard.reason });
      guard.assertValid();
    }
  }, { auto: true }],
  perfReadiness: [async ({ kupua }, use, testInfo) => {
    const originalWait = kupua.waitForResults;
    kupua.waitForResults = async (timeout, density) => {
      try { await waitForPerfResults(kupua, timeout, density); }
      catch (error) {
        if (error instanceof Error && error.message.startsWith("Required search data unavailable")) {
          testInfo.annotations.push({ type: "perf-failure", description: "setup-data-error" });
        }
        throw error;
      }
    };
    const diagnostic = {
      responses: 0, failedResponses: 0, unexpectedContentTypes: 0,
      responseSamples: [] as { status: number; contentType: string }[],
      transportFailures: {} as Record<string, number>,
    };
    const isDataUrl = (raw: string) => isMediaApiUrl(raw) || new URL(raw).pathname.startsWith("/es/");
    const onResponse = (response: Response) => {
      if (!isDataUrl(response.url())) return;
      diagnostic.responses++;
      const status = response.status();
      const header = response.headers()["content-type"] ?? "";
      const contentType = /\b(?:application\/json|application\/[\w.+-]+\+json)\b/i.test(header) ? "json"
        : /^text\/html\b/i.test(header) ? "html" : "other";
      const failed = status >= 400;
      const unexpected = status >= 200 && status < 300 && status !== 204 && contentType !== "json";
      if (failed) diagnostic.failedResponses++;
      if (unexpected) diagnostic.unexpectedContentTypes++;
      if ((failed || unexpected) && diagnostic.responseSamples.length < 8) {
        diagnostic.responseSamples.push({ status, contentType });
      }
    };
    const onFailed = (request: Request) => {
      if (!isDataUrl(request.url())) return;
      const error = request.failure()?.errorText;
      const category = error === "net::ERR_ABORTED" ? "aborted"
        : error === "net::ERR_NAME_NOT_RESOLVED" ? "dns"
        : error === "net::ERR_TIMED_OUT" || error === "net::ERR_CONNECTION_TIMED_OUT" ? "timeout"
        : error === "net::ERR_CONNECTION_REFUSED" || error === "net::ERR_CONNECTION_RESET" ? "connection"
        : error === "net::ERR_CERT_AUTHORITY_INVALID" || error === "net::ERR_CERT_DATE_INVALID" ? "certificate" : "other";
      diagnostic.transportFailures[category] = (diagnostic.transportFailures[category] ?? 0) + 1;
    };
    kupua.page.on("response", onResponse);
    kupua.page.on("requestfailed", onFailed);
    try {
      await use();
    } finally {
      kupua.waitForResults = originalWait;
      kupua.page.off("response", onResponse);
      kupua.page.off("requestfailed", onFailed);
      if (testInfo.status === "failed" || testInfo.status === "timedOut" || testInfo.status === "interrupted") {
        try {
          Object.assign(diagnostic, { readiness: await kupua.page.evaluate(() => {
            const state = (window as any).__kupua_store__?.getState();
            const entries = (window as any).__perceivedTrace__ ?? [];
            const starts = entries.filter((entry: any) => entry.phase === "t_0" && entry.interactionId);
            return { storePresent: Boolean(state), loading: Boolean(state?.loading), hasError: Boolean(state?.error),
              resultsPresent: Boolean(state?.results?.length), searchStarts: starts.length,
              correlatedReady: starts.filter((start: any) => entries.some((entry: any) => entry.phase === "t_store_ready" && entry.interactionId === start.interactionId)).length };
          }) });
        } catch {}
        (testInfo.annotations ??= []).push({ type: "perf-data-evidence", description: JSON.stringify(diagnostic) });
        console.log(`Perf data failure evidence: ${JSON.stringify(diagnostic)}`);
      }
    }
  }, { auto: true }],
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
  perfEnvironment: [async ({ kupua, browserName, perfAuth }, use, testInfo) => {
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
    const expectedTopology = process.env.KUPUA_PERF_API_TOPOLOGY;
    if (expectedTopology && appEnvironment.apiTopology !== expectedTopology) {
      testInfo?.annotations.push({ type: "perf-failure", description: "capture-invalid" });
      throw new Error(`App API topology mismatch: requested ${expectedTopology}, observed ${appEnvironment.apiTopology ?? "unknown"}`);
    }
    const expectedDelivery = process.env.KUPUA_PERF_MEDIA_DELIVERY;
    if (expectedDelivery && appEnvironment.mediaDelivery !== expectedDelivery) {
      testInfo?.annotations.push({ type: "perf-failure", description: "capture-invalid" });
      throw new Error(`App media delivery mismatch: requested ${expectedDelivery}, observed ${appEnvironment.mediaDelivery ?? "unknown"}`);
    }
    await use();
    const after = await kupua.page.request.get("/__kupua/perf-environment", { maxRedirects: 0 });
    perfAuth?.inspect(after);
    perfAuth?.assertAuthenticated();
    if (!after.ok() || JSON.stringify(await after.json()) !== JSON.stringify(appEnvironment)) {
      testInfo?.annotations.push({ type: "perf-failure", description: "capture-invalid" });
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
