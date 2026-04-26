/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mintKupuaKey,
  getCurrentKupuaKey,
  withCurrentKupuaKey,
  withFreshKupuaKey,
  synthesiseKupuaKeyIfAbsent,
} from "./history-key";

// ---------------------------------------------------------------------------
// Helpers — getCurrentKupuaKey reads window.history.state
// ---------------------------------------------------------------------------

let historyStateSpy: ReturnType<typeof vi.spyOn> | null = null;

function setMockHistoryState(state: Record<string, unknown> | null) {
  historyStateSpy?.mockRestore();
  historyStateSpy = vi.spyOn(window.history, "state", "get").mockReturnValue(state);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("history-key", () => {
  afterEach(() => {
    historyStateSpy?.mockRestore();
    historyStateSpy = null;
  });

  describe("mintKupuaKey", () => {
    it("returns a valid UUID string", () => {
      const key = mintKupuaKey();
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("returns unique keys on each call", () => {
      const a = mintKupuaKey();
      const b = mintKupuaKey();
      expect(a).not.toBe(b);
    });
  });

  describe("getCurrentKupuaKey", () => {
    it("returns undefined when no kupuaKey in state", () => {
      setMockHistoryState({});
      expect(getCurrentKupuaKey()).toBeUndefined();
    });

    it("returns the kupuaKey from history state", () => {
      setMockHistoryState({ kupuaKey: "abc-123" });
      expect(getCurrentKupuaKey()).toBe("abc-123");
    });

    it("returns undefined when state is null", () => {
      setMockHistoryState(null);
      expect(getCurrentKupuaKey()).toBeUndefined();
    });
  });

  describe("withCurrentKupuaKey", () => {
    it("returns full history.state with kupuaKey preserved", () => {
      setMockHistoryState({ kupuaKey: "existing-key", __TSR_key: "tsr-1", __TSR_index: 3 });
      const result = withCurrentKupuaKey();
      expect(result).toEqual({ kupuaKey: "existing-key", __TSR_key: "tsr-1", __TSR_index: 3 });
    });

    it("merges with extra state, kupuaKey wins", () => {
      setMockHistoryState({ kupuaKey: "existing-key", other: "value" });
      const result = withCurrentKupuaKey({ foo: "bar" });
      expect(result).toEqual({ kupuaKey: "existing-key", other: "value", foo: "bar" });
    });

    it("preserves _bareListSynthesized across replace (H1 regression)", () => {
      setMockHistoryState({ kupuaKey: "k1", _bareListSynthesized: true, __TSR_key: "tsr-1" });
      const result = withCurrentKupuaKey();
      expect(result._bareListSynthesized).toBe(true);
      expect(result.kupuaKey).toBe("k1");
    });

    it("extraState overrides existing state fields (except kupuaKey)", () => {
      setMockHistoryState({ kupuaKey: "k1", flag: "old" });
      const result = withCurrentKupuaKey({ flag: "new" });
      expect(result.flag).toBe("new");
      expect(result.kupuaKey).toBe("k1");
    });

    it("returns empty object when no kupuaKey exists", () => {
      setMockHistoryState({});
      expect(withCurrentKupuaKey()).toEqual({});
    });

    it("returns extraState as-is when no kupuaKey exists", () => {
      setMockHistoryState({});
      expect(withCurrentKupuaKey({ foo: "bar" })).toEqual({ foo: "bar" });
    });
  });

  describe("withFreshKupuaKey", () => {
    it("returns object with a new UUID kupuaKey", () => {
      const result = withFreshKupuaKey();
      expect(result.kupuaKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("merges with extra state", () => {
      const result = withFreshKupuaKey({ foo: "bar" });
      expect(result.foo).toBe("bar");
      expect(result.kupuaKey).toBeDefined();
    });

    it("kupuaKey overwrites extra state if both have kupuaKey", () => {
      const result = withFreshKupuaKey({ kupuaKey: "old" });
      expect(result.kupuaKey).not.toBe("old");
    });
  });

  describe("synthesiseKupuaKeyIfAbsent", () => {
    let replaceStateSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      replaceStateSpy = vi.spyOn(window.history, "replaceState");
    });

    afterEach(() => {
      replaceStateSpy.mockRestore();
    });

    it("mints and replaces state when no kupuaKey exists", () => {
      setMockHistoryState({});

      synthesiseKupuaKeyIfAbsent();

      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
      const newState = replaceStateSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(newState.kupuaKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("is a no-op when kupuaKey already exists", () => {
      setMockHistoryState({ kupuaKey: "already-here" });

      synthesiseKupuaKeyIfAbsent();

      expect(replaceStateSpy).not.toHaveBeenCalled();
    });

    it("preserves existing history.state fields when synthesising", () => {
      setMockHistoryState({
        __TSR_key: "tsr-key-123",
        someOther: "value",
      });

      synthesiseKupuaKeyIfAbsent();

      const newState = replaceStateSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(newState.__TSR_key).toBe("tsr-key-123");
      expect(newState.someOther).toBe("value");
      expect(newState.kupuaKey).toBeDefined();
    });
  });
});
