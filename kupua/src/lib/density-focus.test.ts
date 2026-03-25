import { describe, it, expect } from "vitest";
import { saveFocusRatio, consumeFocusRatio } from "./density-focus";

describe("density-focus", () => {
  it("returns null when nothing has been saved", () => {
    expect(consumeFocusRatio()).toBeNull();
  });

  it("returns the saved ratio and clears it (one-shot)", () => {
    saveFocusRatio(0.25);
    expect(consumeFocusRatio()).toBe(0.25);
    expect(consumeFocusRatio()).toBeNull();
  });

  it("last save wins", () => {
    saveFocusRatio(0.1);
    saveFocusRatio(0.9);
    expect(consumeFocusRatio()).toBe(0.9);
  });
});

