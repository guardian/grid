import { describe, it, expect, beforeEach, vi } from "vitest";
import { isSupplierOverQuota, getOverQuotaSuppliers, fetchQuotas, _setQuotaMapForTest } from "./quota-store";

beforeEach(() => {
  _setQuotaMapForTest(new Map());
  vi.restoreAllMocks();
});

describe("getOverQuotaSuppliers", () => {
  it("returns empty array when map is empty", () => {
    expect(getOverQuotaSuppliers()).toEqual([]);
  });

  it("returns only exceeded suppliers", () => {
    _setQuotaMapForTest(new Map([["Getty Images", true], ["AP", false], ["Reuters", true]]));
    expect(getOverQuotaSuppliers()).toEqual(expect.arrayContaining(["Getty Images", "Reuters"]));
    expect(getOverQuotaSuppliers()).not.toContain("AP");
  });
});

describe("isSupplierOverQuota", () => {
  it("returns false when map is empty", () => {
    expect(isSupplierOverQuota("Getty Images")).toBe(false);
  });

  it("returns true when supplier is in the map", () => {
    _setQuotaMapForTest(new Map([["Getty Images", true]]));
    expect(isSupplierOverQuota("Getty Images")).toBe(true);
  });

  it("returns false for a supplier not in the map", () => {
    _setQuotaMapForTest(new Map([["Getty Images", true]]));
    expect(isSupplierOverQuota("Reuters")).toBe(false);
  });
});

describe("fetchQuotas", () => {
  it("populates the map from a valid response", async () => {
    const mockResponse = {
      data: {
        store: {
          "Getty Images": { exceeded: true, fractionOfQuota: 1.2 },
          "AP":            { exceeded: false, fractionOfQuota: 0.3 },
        },
        lastUpdated: "2026-05-10T12:00:00Z",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    fetchQuotas();
    // Let the microtask queue flush
    await new Promise((r) => setTimeout(r, 0));

    expect(isSupplierOverQuota("Getty Images")).toBe(true);
    expect(isSupplierOverQuota("AP")).toBe(false);
  });

  it("leaves map empty on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    fetchQuotas();
    await new Promise((r) => setTimeout(r, 0));

    expect(isSupplierOverQuota("Getty Images")).toBe(false);
  });

  it("leaves map empty on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    fetchQuotas();
    await new Promise((r) => setTimeout(r, 0));

    expect(isSupplierOverQuota("Getty Images")).toBe(false);
  });

  it("leaves map empty when response has no store field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    }));

    fetchQuotas();
    await new Promise((r) => setTimeout(r, 0));

    expect(isSupplierOverQuota("Getty Images")).toBe(false);
  });
});
