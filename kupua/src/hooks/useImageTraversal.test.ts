/**
 * @vitest-environment jsdom
 *
 * Session lifecycle regression test for useImageTraversal.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSearchStore } from "@/stores/search-store";
import type { Image } from "@/types/image";
import { useImageTraversal } from "./useImageTraversal";

vi.mock("@/lib/image-prefetch", () => ({
  prefetchNearbyImages: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal Image object for testing. */
function makeImage(id: string): Image {
  return {
    id,
    uploadTime: "2024-01-01T00:00:00Z",
    uploadedBy: "test",
    softDeletedMetadata: undefined,
    source: { uri: "", name: "", id: "" },
    metadata: {
      description: id,
      credit: undefined,
      byline: undefined,
      title: undefined,
      copyright: undefined,
      copyrightNotice: undefined,
      suppliersReference: undefined,
      keywords: [],
      subjects: [],
      specialInstructions: undefined,
      subLocation: undefined,
      city: undefined,
      state: undefined,
      country: undefined,
      dateTaken: undefined,
      people: [],
    },
    usages: [],
    exports: [],
    collections: [],
    leases: { leases: [], lastModified: undefined },
    usageRights: { category: "handout" },
  } as unknown as Image;
}

/** Set up store state with a buffer at given offset. */
function setupBuffer(opts: {
  bufferOffset: number;
  bufferSize: number;
  total: number;
}) {
  const images = Array.from({ length: opts.bufferSize }, (_, i) =>
    makeImage(`img-${opts.bufferOffset + i}`),
  );

  const imagePositions = new Map<string, number>();
  images.forEach((img, i) => {
    imagePositions.set(img.id, opts.bufferOffset + i);
  });

  useSearchStore.setState({
    results: images,
    bufferOffset: opts.bufferOffset,
    total: opts.total,
    imagePositions,
    positionMap: null,
  });

  return { images, imagePositions };
}

describe("useImageTraversal — session lifecycle", () => {
  beforeEach(() => {
    useSearchStore.setState(useSearchStore.getInitialState());
  });

  it("does not resolve an old pending traversal in a reopened preview session", () => {
    setupBuffer({ bufferOffset: 100, bufferSize: 200, total: 1000 });
    const extendForward = vi.fn();
    const extendBackward = vi.fn();
    useSearchStore.setState({ extendForward, extendBackward });
    const onNavigate = vi.fn();

    const { result, rerender } = renderHook(
      ({ imageId }: { imageId: string | null }) =>
        useImageTraversal(imageId, onNavigate),
      { initialProps: { imageId: "img-299" as string | null } },
    );

    act(() => result.current.goToNext());
    expect(extendForward).toHaveBeenCalled();

    rerender({ imageId: null });
    rerender({ imageId: "img-500" });

    act(() => {
      setupBuffer({ bufferOffset: 500, bufferSize: 200, total: 1000 });
    });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(extendBackward).not.toHaveBeenCalled();
  });
});

