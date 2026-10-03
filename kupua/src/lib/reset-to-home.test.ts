// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "@tanstack/react-router";

const fixture = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const operation = vi.fn<() => Promise<void>>();
  const flags = { restore: null as symbol | null, density: null as symbol | null, detail: null as symbol | null };
  const suppress = (field: keyof typeof flags) => {
    const owner = Symbol(field);
    flags[field] = owner;
    return () => { if (flags[field] === owner) flags[field] = null; };
  };
  const state = {
    params: {} as Record<string, unknown>,
    search: vi.fn(() => { fixture.generation++; listeners.forEach((listener) => listener()); return operation(); }),
    setParams: vi.fn((params: Record<string, unknown>) => { state.params = params; listeners.forEach((listener) => listener()); }),
    setFocusedImageId: vi.fn(),
    abortExtends: vi.fn(),
  };
  const preferences = { density: "grid" as "grid" | "table", _densityIntent: 0,
    setDensity: vi.fn((density: "grid" | "table") => {
      preferences.density = density;
      preferences._densityIntent += 1;
      sessionStorage.setItem("kupua-density", density);
    }) };
  return { state, preferences, operation, flags, suppress, listeners, generation: 0, mobile: false, clearSelection: vi.fn() };
});
const search = fixture.state.search;
const clearSelection = fixture.clearSelection;

vi.mock("@/lib/orchestration/search", () => ({
  resetScrollAndFocusSearch: vi.fn(),
  setPrevParamsSerialized: vi.fn(),
  setPrevSearchOnly: vi.fn(),
  resetCqlInputComponents: vi.fn(),
}));

vi.mock("@/stores/search-store", () => ({
  suppressNextRestore: () => fixture.suppress("restore"),
  getSearchGeneration: () => fixture.generation,
  useSearchStore: {
    getState: () => fixture.state,
    subscribe: (listener: () => void) => { fixture.listeners.add(listener); return () => fixture.listeners.delete(listener); },
  },
}));

vi.mock("@/stores/selection-store", () => ({
  useSelectionStore: { getState: () => ({ clear: clearSelection }) },
}));
vi.mock("@/stores/ui-prefs-store", () => ({ useUiPrefsStore: { getState: () => fixture.preferences } }));

vi.mock("@/hooks/useReturnFromDetail", () => ({ suppressReturnFromDetail: () => fixture.suppress("detail") }));
vi.mock("@/hooks/useScrollEffects", () => ({
  clearDensityFocusRatio: vi.fn(),
  suppressDensityFocusSave: vi.fn(() => fixture.suppress("density")),
}));
vi.mock("@/lib/is-mobile", () => ({ isMobile: () => fixture.mobile }));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("resetToHome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fixture.operation.mockReset().mockResolvedValue(undefined);
    fixture.mobile = true;
    fixture.flags.restore = fixture.flags.density = fixture.flags.detail = null;
    fixture.listeners.clear();
    fixture.preferences.density = "grid";
    fixture.preferences._densityIntent = 0;
    sessionStorage.removeItem("kupua-density");
    window.history.replaceState(null, "", "/search?nonFree=true&until=2026-03-04T00:00:00Z&query=city%3ADublin");
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
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

  for (const supersession of ["search", "history"] as const) {
    for (const completion of ["resolve", "abort", "reject"] as const) {
      it(`${supersession} supersedes Home's later ${completion}`, async () => {
        const { resetToHome } = await import("./reset-to-home");
        const pending = deferred();
        fixture.operation.mockReturnValueOnce(pending.promise);
        const history = createMemoryHistory({ initialEntries: ["/search?nonFree=true"] });
        fixture.preferences.setDensity("table");
        const navigate = vi.fn();
        const home = resetToHome(navigate, undefined, history);
        if (supersession === "search") await fixture.state.search();
        else history.push("/search?query=newer");
        if (completion === "resolve") pending.resolve();
        else pending.reject(Object.assign(new Error(completion), { name: completion === "abort" ? "AbortError" : "Error" }));
        await home;
        expect(navigate).not.toHaveBeenCalled();
        expect(fixture.preferences.density).toBe("table");
        expect(sessionStorage.getItem("kupua-density")).toBe("table");
        expect(fixture.flags).toEqual({ restore: null, density: null, detail: null });
        expect(fixture.listeners.size).toBe(0);
      });
    }
  }

  it("overlapping Home requests leave navigation and suppression to the successor", async () => {
    const { resetToHome } = await import("./reset-to-home");
    const first = deferred();
    const second = deferred();
    fixture.operation.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const obsolete = vi.fn();
    const current = vi.fn();
    const firstHome = resetToHome(obsolete);
    const secondHome = resetToHome(current);
    const successorSuppression = fixture.flags.restore;
    first.resolve();
    await firstHome;
    expect(obsolete).not.toHaveBeenCalled();
    expect(fixture.flags.restore).toBe(successorSuppression);
    second.resolve();
    await secondHome;
    expect(current).toHaveBeenCalledOnce();
  });

  it("waits for data before density suppression and ordinary Home navigation", async () => {
    const { resetToHome } = await import("./reset-to-home");
    fixture.preferences.setDensity("table");
    const pending = deferred();
    fixture.operation.mockReturnValueOnce(pending.promise);
    const navigate = vi.fn();
    const home = resetToHome(navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.flags.density).toBeNull();
    expect(fixture.preferences.density).toBe("table");
    expect(clearSelection).toHaveBeenCalledOnce();
    pending.resolve();
    await home;
    expect(navigate).toHaveBeenCalledOnce();
    expect(fixture.flags.density).not.toBeNull();
    expect(fixture.preferences.density).toBe("grid");
    expect(sessionStorage.getItem("kupua-density")).toBe("grid");
  });

  it.each([{ choices: ["grid"] as const }, { choices: ["grid", "table"] as const }, { choices: ["table"] as const }])("later density intent $choices survives Home without cancelling its query reset", async ({ choices }) => {
    const { resetToHome } = await import("./reset-to-home");
    fixture.preferences.setDensity("table");
    const pending = deferred();
    fixture.operation.mockReturnValueOnce(pending.promise);
    const navigate = vi.fn();
    const home = resetToHome(navigate);
    for (const choice of choices) fixture.preferences.setDensity(choice);
    const last = choices.at(-1)!;
    const intent = fixture.preferences._densityIntent;
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.preferences.density).toBe(last);
    pending.resolve();
    await home;
    expect(navigate).toHaveBeenCalledOnce();
    expect(fixture.state.params).toMatchObject({ query: undefined, nonFree: "true", offset: 0 });
    expect(fixture.preferences.density).toBe(last);
    expect(fixture.preferences._densityIntent).toBe(intent);
    expect(sessionStorage.getItem("kupua-density")).toBe(last);
    expect(fixture.flags.density).toBeNull();
  });

  it("current Home failure still navigates gracefully", async () => {
    const { resetToHome } = await import("./reset-to-home");
    fixture.operation.mockRejectedValueOnce(new Error("current failure"));
    const navigate = vi.fn();
    fixture.preferences.setDensity("table");
    await resetToHome(navigate);
    expect(navigate).toHaveBeenCalledOnce();
    expect(fixture.preferences.density).toBe("grid");
  });

  it("obsolete safety cleanup cannot clear a newer Home's suppression", async () => {
    const { resetToHome } = await import("./reset-to-home");
    await resetToHome(vi.fn());
    vi.advanceTimersByTime(1500);
    const pending = deferred();
    fixture.operation.mockReturnValueOnce(pending.promise);
    const home = resetToHome(vi.fn());
    const successorSuppression = fixture.flags.restore;
    vi.advanceTimersByTime(500);
    expect(fixture.flags.restore).toBe(successorSuppression);
    pending.resolve();
    await home;
    vi.advanceTimersByTime(2000);
    expect(fixture.flags.restore).toBeNull();
  });

  it("scheduled desktop focus does not steal focus after departure", async () => {
    const { resetToHome } = await import("./reset-to-home");
    fixture.mobile = false;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    const input = document.createElement("cql-input");
    document.body.append(input);
    const focus = vi.spyOn(input, "focus");
    const history = createMemoryHistory({ initialEntries: ["/search?nonFree=true"] });
    await resetToHome(() => history.push("/search?nonFree=true"), undefined, history);
    history.push("/search?query=newer");
    frames.forEach((callback) => callback(0));
    expect(focus).not.toHaveBeenCalled();
  });

  it("mobile Home never focuses the search input", async () => {
    const { resetToHome } = await import("./reset-to-home");
    const input = document.createElement("cql-input");
    document.body.append(input);
    const focus = vi.spyOn(input, "focus");
    await resetToHome(vi.fn());
    vi.runOnlyPendingTimers();
    expect(focus).not.toHaveBeenCalled();
  });

  for (const superseded of [false, true]) {
    it(`initial Home focus frame ${superseded ? "yields to departure" : "remains valid while awaiting data"}`, async () => {
      const { resetToHome } = await import("./reset-to-home");
      const mocked = await import("@/lib/orchestration/search");
      vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
      const actual = await vi.importActual<typeof import("@/lib/orchestration/search")>("@/lib/orchestration/search");
      vi.mocked(mocked.resetScrollAndFocusSearch).mockImplementationOnce(actual.resetScrollAndFocusSearch);
      fixture.mobile = false;
      const frames: FrameRequestCallback[] = [];
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
      const input = document.createElement("cql-input");
      document.body.append(input);
      const focus = vi.spyOn(input, "focus");
      const pending = deferred();
      fixture.operation.mockReturnValueOnce(pending.promise);
      const history = createMemoryHistory({ initialEntries: ["/search?query=first"] });
      const home = resetToHome(vi.fn(), undefined, history);
      expect(frames).toHaveLength(1);
      if (superseded) history.push("/search?query=newer");
      frames[0](0);
      expect(focus).toHaveBeenCalledTimes(superseded ? 0 : 1);
      pending.resolve();
      await home;
    });
  }
});