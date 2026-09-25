/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEnrichedImage } from "./useEnrichedImage";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import type { Image } from "@/types/image";

const image = { id: "img-1", metadata: {}, usageRights: { category: "staff-photographer" } } as unknown as Image;

afterEach(() => useEnrichmentStore.getState().setEnrichment(new Map()));

describe("useEnrichedImage", () => {
  it("uses the shared overlay for the image when no overlay is supplied", () => {
    useEnrichmentStore.getState().setEnrichment(new Map([["img-1", { cost: "overquota" }]]));
    const { result } = renderHook(() => useEnrichedImage(image));
    expect(result.current?.cost).toBe("overquota");
  });

  it("prefers a supplied overlay to the shared one and keeps it when the shared store is replaced", () => {
    useEnrichmentStore.getState().setEnrichment(new Map([["img-1", { cost: "pay" }]]));
    const { result } = renderHook(() => useEnrichedImage(image, { cost: "overquota", persisted: { value: true, reasons: [] } }));
    expect(result.current).toMatchObject({ cost: "overquota", persisted: { value: true, reasons: [] } });
    act(() => useEnrichmentStore.getState().setEnrichment(new Map()));
    expect(result.current?.cost).toBe("overquota");
  });
});
