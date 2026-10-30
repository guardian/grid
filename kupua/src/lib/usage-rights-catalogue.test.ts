// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const links = vi.hoisted(() => ({ edits: "https://metadata.example.test" as string | undefined }));
vi.mock("@/lib/grid-api-instance", () => ({ serviceLink: async (rel: string) => (rel === "edits" ? links.edits : undefined) }));

import { categoryLabel } from "./category-labels";
import { loadUsageRightsCatalogue, useUsageRightsCatalogue } from "./usage-rights-catalogue";

const categories = [
  { value: "", name: "Unknown Rights", cost: "pay", description: "" },
  { value: "publisher-photographer", name: "ACME Photographer", searchAlias: "acme-photographer", cost: "free", description: "",
    legacyCategories: ["staff-photographer"] },
  { value: "commissioned-agency", name: "Agency – commissioned (server)", cost: "free", description: "" },
];

function stubEditsService(list: unknown, ok = true) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "https://metadata.example.test") {
      return Response.json({ data: {}, links: [{ rel: "usage-rights-list", href: "https://metadata.example.test/usage-rights/categories" }] });
    }
    if (url === "https://metadata.example.test/usage-rights/categories") {
      return ok ? Response.json({ data: list }) : new Response(null, { status: 503 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  links.edits = "https://metadata.example.test";
  useUsageRightsCatalogue.setState({ categories: null });
});

describe("usage rights catalogue", () => {
  it("follows media-api's edits link to metadata-editor's category list, as Kahuna does", async () => {
    const fetchMock = stubEditsService(categories);
    await loadUsageRightsCatalogue();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://metadata.example.test", "https://metadata.example.test/usage-rights/categories",
    ]);
    expect(useUsageRightsCatalogue.getState().categories).toEqual([
      { value: "", name: "Unknown Rights" },
      { value: "publisher-photographer", name: "ACME Photographer", searchAlias: "acme-photographer", legacyCategories: ["staff-photographer"] },
      { value: "commissioned-agency", name: "Agency – commissioned (server)" },
    ]);
  });

  it.each([
    ["no edits link", () => { links.edits = undefined; stubEditsService(categories); }],
    ["an unavailable list", () => stubEditsService(categories, false)],
    ["a malformed entry", () => stubEditsService([...categories, { value: "x" }])],
    ["malformed replaced values", () => stubEditsService([{ ...categories[0], legacyCategories: [3] }])],
    ["a non-array body", () => stubEditsService({ value: "x" })],
    ["a network failure", () => vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }))],
  ])("stays absent with %s", async (_label, arrange) => {
    arrange();
    await loadUsageRightsCatalogue();
    expect(useUsageRightsCatalogue.getState().categories).toBeNull();
  });
});

describe("category labels", () => {
  it("use the server's names when loaded, otherwise the local fallback", () => {
    expect(categoryLabel("")).toBe("Unknown Rights");
    expect(categoryLabel("pay-to-use")).toBe("Pay to use");
    expect(categoryLabel("pr-and-third-party")).toBe("PR & Third Party");
    expect(categoryLabel("publisher-photographer")).toBe("GNM Photographer");
    expect(categoryLabel("unlisted-category")).toBe("unlisted-category");
    expect(categoryLabel(undefined)).toBe("None");

    useUsageRightsCatalogue.setState({ categories: [
      { value: "publisher-photographer", name: "ACME Photographer", searchAlias: "acme-photographer" },
    ] });
    expect(categoryLabel("publisher-photographer")).toBe("ACME Photographer");
    expect(categoryLabel("pay-to-use")).toBe("Pay to use");
  });
});
