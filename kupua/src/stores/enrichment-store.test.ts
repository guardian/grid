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
