// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.fn().mockResolvedValue(undefined);
const setParams = vi.fn();
const clearSelection = vi.fn();

vi.mock("@/lib/orchestration/search", () => ({
  resetScrollAndFocusSearch: vi.fn(),
  setPrevParamsSerialized: vi.fn(),
  setPrevSearchOnly: vi.fn(),
  resetCqlInputComponents: vi.fn(),
}));

vi.mock("@/stores/search-store", () => ({
  suppressNextRestore: vi.fn(),
  clearSuppressRestore: vi.fn(),
  useSearchStore: {
    getState: () => ({
      search,
      setParams,
      setFocusedImageId: vi.fn(),
    }),
  },
}));

vi.mock("@/stores/selection-store", () => ({
  useSelectionStore: { getState: () => ({ clear: clearSelection }) },
}));

vi.mock("@/hooks/useReturnFromDetail", () => ({ suppressReturnFromDetail: vi.fn() }));
vi.mock("@/hooks/useScrollEffects", () => ({
  clearDensityFocusRatio: vi.fn(),
  suppressDensityFocusSave: vi.fn(),
}));
vi.mock("@/lib/is-mobile", () => ({ isMobile: () => true }));

describe("resetToHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/search?nonFree=true&until=2026-03-04T00:00:00Z&query=city%3ADublin");
  });

  it("passes the owned home-logo interaction to the direct search", async () => {
    const { resetToHome } = await import("./reset-to-home");
    const navigate = vi.fn();

    await resetToHome(navigate, "home-logo:123:1");

    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith(undefined, {
      traceAction: "home-logo",
      traceInteractionId: "home-logo:123:1",
    });
    expect(navigate).toHaveBeenCalledOnce();
  });
});