// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import traceSource from "./perceived-trace.ts?raw";

describe("perceived trace gate", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.removeItem("kupua_perceived_perf");
    delete (window as unknown as Record<string, unknown>).__perceivedTrace__;
    delete (window as unknown as Record<string, unknown>).__perceivedTraceClear__;
    vi.stubGlobal("performance", { now: vi.fn(() => 1), mark: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    window.localStorage.removeItem("kupua_perceived_perf");
    delete (window as unknown as Record<string, unknown>).__perceivedTrace__;
    delete (window as unknown as Record<string, unknown>).__perceivedTraceClear__;
  });

  it("documents the existing gate without claiming production elimination", () => {
    const header = traceSource.slice(0, traceSource.indexOf("export interface TraceEntry"));
    expect(header).toContain("DEV: enabled regardless of the localStorage flag");
    expect(header).toContain("Non-DEV: enabled only when");
    expect(header).not.toMatch(/tree-shaken out entirely|Zero bundle bytes|off by default/);
  });

  it.each([
    { dev: true, flag: null, enabled: true },
    { dev: true, flag: "0", enabled: true },
    { dev: true, flag: "1", enabled: true },
    { dev: false, flag: null, enabled: false },
    { dev: false, flag: "0", enabled: false },
    { dev: false, flag: "1", enabled: true },
  ])("DEV=$dev, flag=$flag enables tracing: $enabled", async ({ dev, flag, enabled }) => {
    vi.stubEnv("DEV", dev);
    if (flag !== null) window.localStorage.setItem("kupua_perceived_perf", flag);
    const { beginTraceInteraction, trace, traceInteraction } = await import("./perceived-trace");
    const interactionId = beginTraceInteraction("gate-check");
    trace("gate-check", "t_ack");
    traceInteraction("gate-check", "t_store_ready", interactionId);

    const exposed = window as unknown as Record<string, unknown>;
    if (enabled) {
      expect(interactionId).not.toBe("");
      expect(exposed.__perceivedTrace__).toHaveLength(3);
      expect(exposed.__perceivedTraceClear__).toBeTypeOf("function");
      expect(performance.mark).toHaveBeenCalledTimes(3);
      (exposed.__perceivedTraceClear__ as () => void)();
      expect(exposed.__perceivedTrace__).toHaveLength(0);
    } else {
      expect(interactionId).toBe("");
      expect(exposed.__perceivedTrace__).toBeUndefined();
      expect(exposed.__perceivedTraceClear__).toBeUndefined();
      expect(performance.mark).not.toHaveBeenCalled();
    }
  });

  it.each([false, true])("captures the non-DEV opt-in at module load: $0", async (enabled) => {
    vi.stubEnv("DEV", false);
    if (enabled) window.localStorage.setItem("kupua_perceived_perf", "1");
    const { beginTraceInteraction } = await import("./perceived-trace");
    window.localStorage.setItem("kupua_perceived_perf", enabled ? "0" : "1");
    expect(Boolean(beginTraceInteraction("gate-check"))).toBe(enabled);
  });
});

describe("perceived trace interactions", () => {
  beforeEach(() => {
    vi.resetModules();
    window.localStorage.setItem("kupua_perceived_perf", "1");
  });

  it("assigns a unique interaction ID and carries it through later phases", async () => {
    const { beginTraceInteraction, trace } = await import("./perceived-trace");

    const interactionId = beginTraceInteraction("sort-around-focus", { sort: "uploadTime" });
    trace("sort-around-focus", "t_ack");

    const entries = (window as unknown as { __perceivedTrace__: Array<{ interactionId?: string }> })
      .__perceivedTrace__;
    expect(interactionId).toBeTruthy();
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.interactionId === interactionId)).toBe(true);
  });

  it("clears the active interaction after a terminal phase", async () => {
    const { beginTraceInteraction, trace } = await import("./perceived-trace");

    const interactionId = beginTraceInteraction("sort-around-focus");
    trace("sort-around-focus", "t_store_ready");
    trace("sort-around-focus", "t_ack");

    const entries = (window as unknown as { __perceivedTrace__: Array<{ interactionId?: string }> })
      .__perceivedTrace__;
    expect(entries[0].interactionId).toBe(interactionId);
    expect(entries[1].interactionId).toBe(interactionId);
    expect(entries[2].interactionId).toBeUndefined();
  });

  it("consumes a pending interaction exactly once for async ownership", async () => {
    const { beginTraceInteraction, consumeTraceInteraction } = await import("./perceived-trace");

    const interactionId = beginTraceInteraction("search");

    expect(consumeTraceInteraction("search")).toBe(interactionId);
    expect(consumeTraceInteraction("search")).toBeUndefined();
  });

  it("claims metadata ownership before generic search for a query navigation", async () => {
    const { beginTraceInteraction, claimTraceInteraction } = await import("./perceived-trace");

    const metadataInteractionId = beginTraceInteraction("metadata-click");
    beginTraceInteraction("search");

    expect(claimTraceInteraction(["metadata-click", "search"])).toEqual({
      action: "metadata-click",
      interactionId: metadataInteractionId,
    });
    expect(claimTraceInteraction(["metadata-click", "search"])).toBeUndefined();
  });

  it("claims facet ownership before generic search for a query navigation", async () => {
    const { beginTraceInteraction, claimTraceInteraction } = await import("./perceived-trace");

    const facetInteractionId = beginTraceInteraction("facet-click");
    beginTraceInteraction("search");

    expect(claimTraceInteraction(["metadata-click", "facet-click", "search"])).toEqual({
      action: "facet-click",
      interactionId: facetInteractionId,
    });
  });
});