import { describe, it, expect } from "vitest";
import {
  _updateForwardVelocity,
  forwardExtendThreshold,
} from "@/hooks/useDataWindow";
import { PAGE_SIZE } from "@/constants/tuning";

describe("forwardExtendThreshold (velocity-aware)", () => {
  it("returns base threshold (50) at zero velocity", () => {
    expect(forwardExtendThreshold(0)).toBe(50);
  });

  it("returns base threshold for negative (upward) velocity", () => {
    expect(forwardExtendThreshold(-2)).toBe(50);
    expect(forwardExtendThreshold(-100)).toBe(50);
  });

  it("widens linearly with positive velocity", () => {
    // 0.1 items/ms × 400ms lookahead = 40 items ahead → 50 + 40 = 90
    expect(forwardExtendThreshold(0.1)).toBe(90);
    // 0.25 items/ms × 400ms = 100 items ahead → 50 + 100 = 150
    expect(forwardExtendThreshold(0.25)).toBe(150);
  });

  it("caps at PAGE_SIZE (no benefit beyond one fetch in flight)", () => {
    // 10 items/ms is absurdly fast; should clamp to PAGE_SIZE
    expect(forwardExtendThreshold(10)).toBe(PAGE_SIZE);
    expect(forwardExtendThreshold(1000)).toBe(PAGE_SIZE);
  });
});

describe("_updateForwardVelocity (EMA)", () => {
  it("returns 0 on first call (no prevTime)", () => {
    expect(_updateForwardVelocity(100, 1000, 0, 0, 0)).toBe(0);
  });

  it("returns 0 on idle gap > IDLE_RESET_MS (250ms)", () => {
    // dt = 300ms — too long; treat as fresh
    expect(_updateForwardVelocity(200, 1300, 1000, 100, 0.5)).toBe(0);
  });

  it("returns 0 on non-monotonic clock (dt <= 0)", () => {
    expect(_updateForwardVelocity(200, 900, 1000, 100, 0.5)).toBe(0);
    expect(_updateForwardVelocity(200, 1000, 1000, 100, 0.5)).toBe(0);
  });

  it("applies EMA: 0.4 × instant + 0.6 × prevEma", () => {
    // delta = 50 items in 100ms = 0.5 items/ms instant
    // prevEma = 0.1 → result = 0.4 × 0.5 + 0.6 × 0.1 = 0.20 + 0.06 = 0.26
    const v = _updateForwardVelocity(150, 1100, 1000, 100, 0.1);
    expect(v).toBeCloseTo(0.26, 5);
  });

  it("smooths bursty input: spike doesn't dominate after one sample", () => {
    // Steady 0.05 items/ms baseline, then 1.0 spike — EMA still well below 1.0
    let v = 0.05;
    v = _updateForwardVelocity(110, 1100, 1000, 100, v); // steady
    // Spike: +200 items in 100ms = 2.0 items/ms
    v = _updateForwardVelocity(310, 1200, 1100, 110, v);
    expect(v).toBeLessThan(1.0); // tempered by EMA
    expect(v).toBeGreaterThan(0.5); // but still reflects the burst
  });

  it("captures backwards velocity as negative", () => {
    // delta = -50 items in 100ms
    const v = _updateForwardVelocity(50, 1100, 1000, 100, 0);
    expect(v).toBeLessThan(0);
  });
});
