import { describe, it, expect } from "vitest";
import { calculateCost } from "./calculate-cost";
import type { GuardianCostConfig } from "./types";

const config: GuardianCostConfig = {
  freeSuppliers: ["Getty Images", "AP"],
  suppliersCollectionExcl: {
    "Getty Images": ["Premium Collection", "Editorial"],
  },
  categoryDefaultCost: {
    "staff-photographer": "free",
    "contract-photographer": "free",
    "commission": "free",
    "handout": "free",
    "pr-image": null,     // null → continue to supplier check
    "agency": null,       // null → continue to supplier check
    "pool": "free",
    "screengrab": "pay",
    "no-rights": null,
    "": null,             // empty string → NoRights → falls through to Pay
  },
};

describe("calculateCost", () => {
  it("returns pay when usageRights is undefined", () => {
    expect(calculateCost(undefined, config)).toBe("pay");
  });

  it("returns conditional when restrictions are present", () => {
    expect(calculateCost({ category: "staff-photographer", restrictions: "Restricted use" }, config)).toBe("conditional");
  });

  it("uses categoryDefaultCost when present", () => {
    expect(calculateCost({ category: "staff-photographer" }, config)).toBe("free");
  });

  it("uses categoryDefaultCost=pay for screengrab", () => {
    expect(calculateCost({ category: "screengrab" }, config)).toBe("pay");
  });

  it("continues when categoryCost is null (falls through)", () => {
    // pr-image has null cost → supplier check → but not agency → default Pay
    expect(calculateCost({ category: "pr-image" }, config)).toBe("pay");
  });

  it("returns free for free agency supplier not in excluded collection", () => {
    expect(calculateCost({
      category: "agency",
      supplier: "Getty Images",
      suppliersCollection: "Sports",
    }, config)).toBe("free");
  });

  it("returns pay for free agency supplier in excluded collection", () => {
    expect(calculateCost({
      category: "agency",
      supplier: "Getty Images",
      suppliersCollection: "Premium Collection",
    }, config)).toBe("pay");
  });

  it("returns pay for agency supplier not in freeSuppliers", () => {
    expect(calculateCost({
      category: "agency",
      supplier: "Alamy",
    }, config)).toBe("pay");
  });

  it("returns free for AP (no suppliersCollectionExcl entry)", () => {
    expect(calculateCost({
      category: "agency",
      supplier: "AP",
      suppliersCollection: "anything",
    }, config)).toBe("free");
  });

  it("returns pay as default when no category matches", () => {
    expect(calculateCost({ category: "unknown-category" }, config)).toBe("pay");
  });

  it("returns pay when usageRights has empty category (NoRights)", () => {
    expect(calculateCost({ category: "" }, config)).toBe("pay");
  });

  it("never returns overquota (server-only)", () => {
    const result = calculateCost({ category: "agency", supplier: "Getty Images" }, config);
    expect(result).not.toBe("overquota");
  });
});
