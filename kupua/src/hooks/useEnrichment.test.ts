/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEnrichment } from "./useEnrichment";
import { useEnrichmentStore } from "@/stores/enrichment-store";

// Mock the gridApi singleton — return null (API unavailable)
vi.mock("@/lib/grid-api-instance", () => ({
  gridApi: {
    enrichByIds: vi.fn().mockResolvedValue(null),
  },
  initGridApi: vi.fn().mockResolvedValue(undefined),
}));

// Mock the search store with minimal state
const { mockUseSearchStore } = vi.hoisted(() => {
  const mockState = {
    params: { query: "test", orderBy: "-uploadTime" },
    bufferOffset: 0,
    results: new Array(10).fill(null),
    loading: false,
    _seekGeneration: 0,
    _prependGeneration: 0,
    _forwardEvictGeneration: 0,
  };
  const fn = Object.assign(
    vi.fn((selector: (s: typeof mockState) => unknown) => selector(mockState)),
    {
      getState: vi.fn(() => mockState),
      subscribe: vi.fn(() => vi.fn()),
    },
  );
  return { mockUseSearchStore: fn };
});
vi.mock("@/stores/search-store", () => ({
  useSearchStore: mockUseSearchStore,
}));

// Mock useVisibleRange — collapsed useEnrichment now calls it for visible-first ordering.
vi.mock("@/hooks/useDataWindow", () => ({
  useVisibleRange: vi.fn(() => ({ start: 0, end: 9 })),
}));

describe("useEnrichment — graceful API absence", () => {
  it("does not throw when gridApi.enrichByIds returns null (API unavailable)", async () => {
    const { unmount } = renderHook(() => useEnrichment());
    // Allow the async effect to run
    await new Promise((r) => setTimeout(r, 50));
    // Store should still be in a clean state (setLoading(false) called)
    expect(useEnrichmentStore.getState().loading).toBe(false);
    unmount();
  });

  it("sets loading=false after null API response", async () => {
    const { unmount } = renderHook(() => useEnrichment());
    await new Promise((r) => setTimeout(r, 50));
    expect(useEnrichmentStore.getState().loading).toBe(false);
    unmount();
  });

  it("does not crash on unmount (abort does not throw)", () => {
    const { unmount } = renderHook(() => useEnrichment());
    expect(() => unmount()).not.toThrow();
  });
});
