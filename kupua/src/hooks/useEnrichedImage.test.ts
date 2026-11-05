/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEnrichedImage } from "./useEnrichedImage";
import { attachEnrichment, useEnrichmentStore } from "@/stores/enrichment-store";
import { extractEnrichment } from "@/dal/grid-api-search-adapter";
import type { Image } from "@/types/image";

const image = { id: "img-1", metadata: {}, usageRights: { category: "staff-photographer" } } as unknown as Image;

afterEach(() => useEnrichmentStore.getState().setEnrichment(new Map()));

describe("useEnrichedImage", () => {
  it("uses the shared overlay for the image when no overlay is supplied", () => {
    const resource = { links: [{ rel: "edits", href: "https://example.com/metadata/img-1" }] };
    const entry = extractEnrichment({ data: { id: image.id, cost: "overquota" }, ...resource })!;
    useEnrichmentStore.getState().setEnrichment(new Map([entry]));
    const { result } = renderHook(() => useEnrichedImage(image));
    expect(result.current?.cost).toBe("overquota");
    expect(result.current?.resource).toEqual(resource);
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([
      extractEnrichment({ data: { id: image.id, valid: false }, actions: [] })!,
    ])));
    expect(result.current).toMatchObject({ resource: { links: [] }, actions: [], valid: false });
  });

  it("prefers a supplied overlay to the shared one and keeps it when the shared store is replaced", () => {
    useEnrichmentStore.getState().setEnrichment(new Map([["img-1", {
      cost: "pay", resource: { links: [{ rel: "edits", href: "https://example.com/metadata/img-1" }] },
    }]]));
    const ownOverlay = extractEnrichment({ data: { id: image.id, cost: "overquota", persisted: { value: true, reasons: [] } } })![1];
    const { result } = renderHook(() => useEnrichedImage(image, ownOverlay));
    expect(result.current).toMatchObject({ cost: "overquota", persisted: { value: true, reasons: [] } });
    expect(result.current?.resource).toEqual({ links: [] });
    act(() => useEnrichmentStore.getState().setEnrichment(new Map()));
    expect(result.current?.cost).toBe("overquota");
    expect(result.current?.resource).toEqual({ links: [] });
  });

  it("falls back to server data read with the image object when the shared store has none", () => {
    const read = { ...image };
    const resource = { links: [{ rel: "crops", href: "https://example.com/crops/img-1" }] };
    attachEnrichment(read, extractEnrichment({ data: { id: image.id, cost: "overquota" }, ...resource })![1]);
    const { result } = renderHook(() => useEnrichedImage(read));
    expect(result.current?.cost).toBe("overquota");
    expect(result.current?.resource).toEqual(resource);
    act(() => useEnrichmentStore.getState().setEnrichment(new Map([
      extractEnrichment({ data: { id: image.id, cost: "pay" } })!,
    ])));
    expect(result.current?.cost).toBe("pay");
    expect(result.current?.resource).toEqual({ links: [] });
  });
});
