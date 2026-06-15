import { describe, it, expect, beforeEach } from "vitest";
import { useEnrichmentStore } from "./enrichment-store";
import type { EnrichmentFields } from "./enrichment-store";

beforeEach(() => {
  // Reset the store between tests
  useEnrichmentStore.setState({ data: new Map(), loading: false });
});

describe("enrichment-store", () => {
  it("initial state: empty data map and not loading", () => {
    const { data, loading } = useEnrichmentStore.getState();
    expect(data.size).toBe(0);
    expect(loading).toBe(false);
  });

  it("setEnrichment replaces the data map", () => {
    const enrichment: EnrichmentFields = { cost: "free" };
    const map = new Map([["img-1", enrichment]]);
    useEnrichmentStore.getState().setEnrichment(map);
    expect(useEnrichmentStore.getState().data.get("img-1")).toEqual(enrichment);
  });

  it("setEnrichment replaces the whole map (old entries gone)", () => {
    useEnrichmentStore.getState().setEnrichment(new Map([["img-1", { cost: "free" }]]));
    useEnrichmentStore.getState().setEnrichment(new Map([["img-2", { cost: "pay" }]]));
    expect(useEnrichmentStore.getState().data.has("img-1")).toBe(false);
    expect(useEnrichmentStore.getState().data.has("img-2")).toBe(true);
  });

  it("getForImage returns undefined when id not present", () => {
    expect(useEnrichmentStore.getState().getForImage("missing")).toBeUndefined();
  });

  it("getForImage returns the enrichment fields for a known id", () => {
    const fields: EnrichmentFields = { cost: "conditional", valid: false };
    useEnrichmentStore.getState().setEnrichment(new Map([["img-3", fields]]));
    expect(useEnrichmentStore.getState().getForImage("img-3")).toEqual(fields);
  });

  it("setLoading updates the loading flag", () => {
    useEnrichmentStore.getState().setLoading(true);
    expect(useEnrichmentStore.getState().loading).toBe(true);
    useEnrichmentStore.getState().setLoading(false);
    expect(useEnrichmentStore.getState().loading).toBe(false);
  });

  it("API cost overwrites ES baseline (merge direction test)", () => {
    // API says "overquota" — this can't come from ES baseline
    const apiEnrichment: EnrichmentFields = { cost: "overquota" };
    useEnrichmentStore.getState().setEnrichment(new Map([["img-4", apiEnrichment]]));
    const result = useEnrichmentStore.getState().getForImage("img-4");
    expect(result?.cost).toBe("overquota");
  });

  it("setEnrichment with empty map clears all data", () => {
    useEnrichmentStore.getState().setEnrichment(new Map([["img-1", { cost: "free" }]]));
    useEnrichmentStore.getState().setEnrichment(new Map());
    expect(useEnrichmentStore.getState().data.size).toBe(0);
  });
});

describe("upsertEnrichment", () => {
  it("adds new ids to an empty store", () => {
    useEnrichmentStore.getState().upsertEnrichment(new Map([["img-1", { cost: "free" }]]));
    expect(useEnrichmentStore.getState().data.get("img-1")).toEqual({ cost: "free" });
  });

  it("merges new ids with existing ids — old entries preserved", () => {
    useEnrichmentStore.getState().setEnrichment(new Map([["img-1", { cost: "free" }]]));
    useEnrichmentStore.getState().upsertEnrichment(new Map([["img-2", { cost: "pay" }]]));
    const state = useEnrichmentStore.getState();
    // img-1 must survive the upsert
    expect(state.data.get("img-1")).toEqual({ cost: "free" });
    expect(state.data.get("img-2")).toEqual({ cost: "pay" });
  });

  it("overwrites same-id entries (extend page updates an image that was already seen)", () => {
    useEnrichmentStore.getState().setEnrichment(new Map([["img-1", { cost: "free" }]]));
    useEnrichmentStore.getState().upsertEnrichment(new Map([["img-1", { cost: "overquota" }]]));
    expect(useEnrichmentStore.getState().data.get("img-1")).toEqual({ cost: "overquota" });
  });

  it("empty input is a no-op — existing data unchanged", () => {
    const initial = new Map<string, EnrichmentFields>([["img-1", { cost: "free" }]]);
    useEnrichmentStore.getState().setEnrichment(initial);
    const before = useEnrichmentStore.getState().data;
    useEnrichmentStore.getState().upsertEnrichment(new Map());
    // state reference should be unchanged (early-return path)
    expect(useEnrichmentStore.getState().data).toBe(before);
  });

  it("setEnrichment replaces all, upsertEnrichment extends — the first-page/extend distinction", () => {
    // Simulate page 1 (fresh search): setEnrichment replaces
    useEnrichmentStore.getState().setEnrichment(new Map([
      ["img-1", { cost: "free" }],
      ["img-2", { cost: "pay" }],
    ]));
    // Simulate page 2 (cursor extend): upsertEnrichment merges
    useEnrichmentStore.getState().upsertEnrichment(new Map([
      ["img-3", { cost: "conditional" }],
    ]));
    const state = useEnrichmentStore.getState();
    expect(state.data.size).toBe(3);
    expect(state.data.get("img-1")?.cost).toBe("free");
    expect(state.data.get("img-2")?.cost).toBe("pay");
    expect(state.data.get("img-3")?.cost).toBe("conditional");
  });

  it("upsert after setEnrichment does not restore entries from before the replace", () => {
    // Two different searches — second setEnrichment should wipe img-A
    useEnrichmentStore.getState().setEnrichment(new Map([["img-A", { cost: "free" }]]));
    useEnrichmentStore.getState().setEnrichment(new Map([["img-B", { cost: "pay" }]]));
    useEnrichmentStore.getState().upsertEnrichment(new Map([["img-C", { cost: "conditional" }]]));
    const state = useEnrichmentStore.getState();
    expect(state.data.has("img-A")).toBe(false);
    expect(state.data.has("img-B")).toBe(true);
    expect(state.data.has("img-C")).toBe(true);
  });
});
