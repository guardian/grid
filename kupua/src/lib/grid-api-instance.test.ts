import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const root = (rels: string[]) => Response.json({ links: rels.map((rel) => ({ rel, href: `https://media.example.test/${rel}` })) });

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("apiAiSearchAvailable", () => {
  it.each([
    ["the ai-search relation is advertised", () => root(["search", "ai-search"]), true],
    ["the root loads without ai-search", () => root(["search"]), false],
    ["the root is refused", () => new Response(null, { status: 403 }), false],
  ] as const)("is %s -> %s, from the root alone", async (_label, answer, expected) => {
    const fetchMock = vi.fn(async (_url: string) => answer());
    vi.stubGlobal("fetch", fetchMock);
    const { apiAiSearchAvailable } = await import("./grid-api-instance");

    await expect(apiAiSearchAvailable()).resolves.toBe(expected);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api"]);
  });

  it("waits for a root read already started by route initialization instead of reporting early absence", async () => {
    let release!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiAiSearchAvailable, initGridApi } = await import("./grid-api-instance");

    const routeInit = initGridApi();
    const availability = apiAiSearchAvailable();
    const early = await Promise.race([availability, new Promise((resolve) => setTimeout(() => resolve("pending"), 10))]);
    expect(early).toBe("pending");

    release(root(["ai-search"]));
    await routeInit;
    await expect(availability).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
