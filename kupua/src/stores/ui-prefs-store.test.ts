// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const values = new Map<string, string>();
const storage: Storage = {
  get length() { return values.size; },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => { values.delete(key); },
  setItem: (key, value) => { values.set(key, value); },
};

beforeEach(() => {
  vi.resetModules();
  values.clear();
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("localStorage", { ...storage, getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn() }));
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("independent per-tab density", () => {
  it.each(["grid", "table"] as const)("reads stored %s synchronously before a view mounts", async (density) => {
    storage.setItem("kupua-density", density);
    const { useUiPrefsStore } = await import("./ui-prefs-store");
    expect(useUiPrefsStore.getState().density).toBe(density);
  });

  it.each([null, "invalid", '{"density":"table"}'])("defaults fresh/invalid storage %j to grid", async (value) => {
    if (value !== null) storage.setItem("kupua-density", value);
    const { useUiPrefsStore } = await import("./ui-prefs-store");
    expect(useUiPrefsStore.getState().density).toBe("grid");
  });

  it("persists actual choices immediately without localStorage or unrelated storage changes", async () => {
    values.set("kupua:histSnap:entry", "snapshot");
    values.set("kupua-selection", "selection");
    const { useUiPrefsStore } = await import("./ui-prefs-store");
    const state = useUiPrefsStore.getState();
    state.setDensity("table");
    expect(storage.getItem("kupua-density")).toBe("table");
    expect(localStorage.setItem).not.toHaveBeenCalledWith("kupua-density", expect.anything());
    vi.resetModules();
    const reloaded = (await import("./ui-prefs-store")).useUiPrefsStore;
    expect(reloaded.getState().density).toBe("table");
    reloaded.getState().setDensity("grid");
    expect(storage.getItem("kupua-density")).toBe("grid");
    expect(values.get("kupua:histSnap:entry")).toBe("snapshot");
    expect(values.get("kupua-selection")).toBe("selection");
  });

  it("advances density intent even when a later choice returns to the original value", async () => {
    const { useUiPrefsStore } = await import("./ui-prefs-store");
    const before = useUiPrefsStore.getState()._densityIntent;
    useUiPrefsStore.getState().setDensity("table");
    useUiPrefsStore.getState().setDensity("grid");
    expect(useUiPrefsStore.getState()._densityIntent).toBeGreaterThan(before);
  });

  it("density stays usable if unrelated localStorage preference writes fail", async () => {
    const { useUiPrefsStore } = await import("./ui-prefs-store");
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error("local preferences blocked"); });
    expect(() => useUiPrefsStore.getState().setDensity("table")).not.toThrow();
    expect(useUiPrefsStore.getState().density).toBe("table");
    expect(storage.getItem("kupua-density")).toBe("table");
  });

  it("local preference hydration cannot override independent session density", async () => {
    values.set("kupua-density", "table");
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ state: {
      focusMode: "phantom", blurGraphicImages: false, density: "invalid",
    }, version: 0 }), setItem: vi.fn(), removeItem: vi.fn() });
    const { useUiPrefsStore } = await import("./ui-prefs-store");
    expect(useUiPrefsStore.getState().density).toBe("table");
    expect(useUiPrefsStore.getState().focusMode).toBe("phantom");
    expect(useUiPrefsStore.getState().blurGraphicImages).toBe(false);
  });

  it("owned Home still navigates after a localStorage write failure", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    const { useUiPrefsStore } = await import("./ui-prefs-store");
    const { useSearchStore } = await import("./search-store");
    const { resetToHome } = await import("@/lib/reset-to-home");
    useUiPrefsStore.getState().setDensity("table");
    vi.spyOn(useSearchStore.getState(), "search").mockResolvedValue(undefined);
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error("local preferences blocked"); });
    const navigate = vi.fn();
    try {
      await expect(resetToHome(navigate)).resolves.toBeUndefined();
      expect(navigate).toHaveBeenCalledOnce();
      expect(useUiPrefsStore.getState().density).toBe("grid");
      expect(storage.getItem("kupua-density")).toBe("grid");
    } finally { vi.runOnlyPendingTimers(); vi.useRealTimers(); }
  });

  it.each(["read", "write", "unavailable"] as const)("degrades quietly when storage is %s", async (failure) => {
    if (failure === "unavailable") vi.stubGlobal("sessionStorage", undefined);
    else vi.spyOn(storage, failure === "read" ? "getItem" : "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const warn = vi.spyOn(console, "warn");
    const { useUiPrefsStore } = await import("./ui-prefs-store");
    expect(useUiPrefsStore.getState().density).toBe("grid");
    expect(() => useUiPrefsStore.getState().setDensity("table")).not.toThrow();
    expect(useUiPrefsStore.getState().density).toBe("table");
    expect(warn).not.toHaveBeenCalled();
  });
});