/**
 * Tests for the module-level state helpers in orchestration/search.ts:
 * - user-initiated navigation flag (read-and-clear)
 * - debounce cancellation + CqlSearchInput remount generation
 *
 * These functions touch zero external imports — no mocking needed. The
 * module has mutable module-level state, so each test re-imports a fresh
 * copy via vi.resetModules() to avoid cross-test contamination.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("orchestration/search.ts — module-level state", () => {
  let mod: typeof import("@/lib/orchestration/search");

  beforeEach(async () => {
    vi.resetModules();
    mod = await import("@/lib/orchestration/search");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("consumeUserInitiatedFlag is read-and-clear", () => {
    mod.markUserInitiatedNavigation();
    expect(mod.consumeUserInitiatedFlag()).toBe(true);
    expect(mod.consumeUserInitiatedFlag()).toBe(false);
  });

  it("adversarial: two consecutive consumes on a fresh (unmarked) module are both false", () => {
    expect(mod.consumeUserInitiatedFlag()).toBe(false);
    expect(mod.consumeUserInitiatedFlag()).toBe(false);
  });

  it("cancelSearchDebounce actually cancels the pending timer callback", () => {
    vi.useFakeTimers();
    let fired = false;
    mod.setDebounceTimer(setTimeout(() => { fired = true; }, 300));

    mod.cancelSearchDebounce("q");
    vi.advanceTimersByTime(500);

    expect(fired).toBe(false);
    expect(mod._externalQuery).toBe("q");
    expect(mod._debounceTimerId).toBe(null);
  });

  it("cancelSearchDebounce does NOT bump the CqlSearchInput generation counter", () => {
    // Since @guardian/cql 1.8.6 (PR #121), setAttribute("value", ...) correctly
    // re-renders polarity-only changes, so cancelSearchDebounce no longer needs
    // to force a remount. Only resetCqlInputComponents() does that now.
    const before = mod.getCqlInputGeneration();
    mod.cancelSearchDebounce();
    expect(mod.getCqlInputGeneration()).toBe(before);
  });

  it("resetCqlInputComponents cancels the debounce AND bumps the generation counter", () => {
    vi.useFakeTimers();
    let fired = false;
    mod.setDebounceTimer(setTimeout(() => { fired = true; }, 300));

    const before = mod.getCqlInputGeneration();
    mod.resetCqlInputComponents();
    vi.advanceTimersByTime(500);

    expect(fired).toBe(false);
    expect(mod._debounceTimerId).toBe(null);
    expect(mod.getCqlInputGeneration()).toBe(before + 1);
  });
});
