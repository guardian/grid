import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const root = (rels: string[]) => Response.json({ links: rels.map((rel) => ({ rel, href: `https://media.example.test/${rel}` })) });

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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

describe("getGridSessionPermissions", () => {
  const sessionHref = "https://auth.example.test/session";
  const sessionRoot = () => Response.json({ links: [{ rel: "session", href: sessionHref }] });

  beforeEach(() => {
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.stubEnv("VITE_GRID_AUTH_ORIGIN", "https://auth.example.test");
  });

  it("reads the discovered session once on demand and retains only explicit permission facts", async () => {
    let release!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionRoot())
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const { getGridSessionPermissions, initGridApi } = await import("./grid-api-instance");

    await initGridApi();
    expect(fetchMock).toHaveBeenCalledOnce();
    const first = getGridSessionPermissions();
    const second = getGridSessionPermissions();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    release(Response.json({ data: { user: {
      name: "Fixture user",
      permissions: { showPaid: false, canUpload: true, unrelated: true },
    } } }));

    for (const request of [first, second]) {
      await expect(request).resolves.toEqual({ showPaid: false, canUpload: true });
    }
    await expect(getGridSessionPermissions()).resolves.toEqual({ showPaid: false, canUpload: true });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api", "/grid-auth/session"]);
    expect(fetchMock).toHaveBeenLastCalledWith("/grid-auth/session", expect.objectContaining({ credentials: "include", redirect: "error" }));
  });

  it("does not request root or session in direct-ES mode", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { getGridSessionPermissions } = await import("./grid-api-instance");
    await expect(getGridSessionPermissions()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send credentials to an unconfigured discovered session origin", async () => {
    vi.stubEnv("VITE_GRID_AUTH_ORIGIN", "https://other.example.test");
    const fetchMock = vi.fn().mockResolvedValueOnce(sessionRoot());
    vi.stubGlobal("fetch", fetchMock);
    const { getGridSessionPermissions } = await import("./grid-api-instance");
    await expect(getGridSessionPermissions()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["unavailable root", () => new Response(null, { status: 503 })],
    ["no session relation", () => root(["permissions"])],
  ] as const)("leaves permissions unknown for %s without inventing an endpoint", async (_label, response) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response());
    vi.stubGlobal("fetch", fetchMock);
    const { getGridSessionPermissions } = await import("./grid-api-instance");
    await expect(getGridSessionPermissions()).resolves.toBeNull();
    await expect(getGridSessionPermissions()).resolves.toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api"]);
  });

  it.each([
    ["expired session", () => new Response(null, { status: 419 })],
    ["refused session", () => new Response(null, { status: 403 })],
    ["network failure", () => Promise.reject(new TypeError("offline"))],
    ["unreadable response", () => new Response("not JSON")],
    ["non-user principal", () => Response.json({ data: { "api-key": { permissions: { canUpload: true } } } })],
    ["malformed permission", () => Response.json({ data: { user: { permissions: { canDelete: "true" } } } })],
  ] as const)("returns quiet cached absence for %s", async (_label, response) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(sessionRoot()).mockImplementationOnce(response);
    vi.stubGlobal("fetch", fetchMock);
    const { getGridSessionPermissions } = await import("./grid-api-instance");
    await expect(getGridSessionPermissions()).resolves.toBeNull();
    await expect(getGridSessionPermissions()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
