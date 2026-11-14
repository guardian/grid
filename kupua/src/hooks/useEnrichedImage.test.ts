/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEnrichedImage } from "./useEnrichedImage";
import { acceptEnrichedImage, attachEnrichment, useEnrichmentStore } from "@/stores/enrichment-store";
import { extractEnrichment } from "@/dal/grid-api-search-adapter";
import type { Image } from "@/types/image";
import { acceptObservedImages, admitLabelObservation, captureImageRead, resetImageFreshnessForTests, stampImageRead } from "@/lib/image-read-freshness";

const image = { id: "img-1", metadata: {}, usageRights: { category: "staff-photographer" } } as unknown as Image;

afterEach(() => { resetImageFreshnessForTests(); useEnrichmentStore.getState().setEnrichment(new Map()); });

describe("useEnrichedImage", () => {
  it("withholds a touched image's old positive authority when a current below-floor read denies editing", () => {
    const oldRead = captureImageRead();
    const positive = { resource: { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/img-1" }] } };
    const stale = { ...image, userMetadata: { labels: [], lastModified: "2026-11-01T00:00:00Z" } };
    const stalePositive = structuredClone(positive);
    stampImageRead(stale, stalePositive, oldRead, "full");
    const operation = admitLabelObservation([image.id]);
    if (typeof operation !== "number") throw new Error(operation);
    const current = { ...image, userMetadata: { labels: ["news"], lastModified: "2026-11-02T00:00:00Z" } };
    stampImageRead(current, positive, captureImageRead(), "full");
    expect(acceptObservedImages([current], operation)).toEqual([current]);
    attachEnrichment(current, positive);
    const { result } = renderHook(() => useEnrichedImage(current, positive));
    expect(result.current?.resource?.links).toHaveLength(1);
    const denied = { resource: { links: [] }, actions: [] };
    stampImageRead({ ...stale }, denied, captureImageRead(), "lean");
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[image.id, denied]])));
    expect(result.current?.resource?.links).toEqual([]);
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[image.id, stalePositive]])));
    expect(result.current?.resource?.links).toEqual([]);
    const renewed = structuredClone(positive);
    stampImageRead({ ...current, userMetadata: { lastModified: "2026-11-03T00:00:00Z" } }, renewed, captureImageRead(), "full");
    act(() => useEnrichmentStore.getState().upsertEnrichment(new Map([[image.id, renewed]])));
    expect(result.current?.resource?.links).toEqual(positive.resource.links);
    expect(result.current?.metadataStale).toBe(true);
    const evictedDenial = { resource: { links: [] }, actions: [] };
    const oldBody = { ...stale };
    stampImageRead(oldBody, evictedDenial, captureImageRead(), "full");
    attachEnrichment(oldBody, evictedDenial);
    expect(acceptEnrichedImage(oldBody)).toBeUndefined();
    const remounted = renderHook(() => useEnrichedImage(current, renewed));
    expect(remounted.result.current?.resource?.links).toEqual([]);
  });

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
