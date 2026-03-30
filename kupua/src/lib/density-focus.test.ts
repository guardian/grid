import { describe, it, expect } from "vitest";
import { saveFocusRatio, consumeFocusRatio } from "./density-focus";

describe("density-focus", () => {
  it("returns null when nothing has been saved", () => {
    expect(consumeFocusRatio()).toBeNull();
  });

  it("returns the saved state and clears it (one-shot)", () => {
    saveFocusRatio(0.25, 42);
    expect(consumeFocusRatio()).toEqual({ ratio: 0.25, localIndex: 42 });
    expect(consumeFocusRatio()).toBeNull();
  });

  it("last save wins", () => {
    saveFocusRatio(0.1, 10);
    saveFocusRatio(0.9, 99);
    expect(consumeFocusRatio()).toEqual({ ratio: 0.9, localIndex: 99 });
  });
});

