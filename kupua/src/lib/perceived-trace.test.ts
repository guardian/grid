// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

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