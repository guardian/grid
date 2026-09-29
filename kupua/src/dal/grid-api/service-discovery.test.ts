import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceDiscovery } from "./service-discovery";

const root = (links: Array<{ rel: string; href: string }>) => Response.json({ data: { description: "This is the Media API" }, links });
const aiSearch = { rel: "ai-search", href: "https://media.example.test/images{?q,aiQuery}" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("ServiceDiscovery readiness", () => {
  it("shares one delayed root read, so concurrent callers only see links once it has loaded", async () => {
    let release!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const discovery = new ServiceDiscovery();

    const settled: string[] = [];
    const first = discovery.init().then((loaded) => { settled.push(`first:${loaded}:${discovery.getLink("ai-search") ?? "none"}`); });
    const second = discovery.init().then((loaded) => { settled.push(`second:${loaded}:${discovery.getLink("ai-search") ?? "none"}`); });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]).toEqual(["/api", expect.objectContaining({ credentials: "include" })]);
    expect(settled).toEqual([]);

    release(root([aiSearch]));
    await Promise.all([first, second]);
    expect(settled).toEqual([`first:true:${aiSearch.href}`, `second:true:${aiSearch.href}`]);
    await discovery.init();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses deployed TEST URLs only when its absolute base is selected", async () => {
    vi.stubEnv("VITE_MEDIA_API_BASE_URL", "https://api.media.test.dev-gutools.co.uk");
    const fetchMock = vi.fn(async () => root([]));
    vi.stubGlobal("fetch", fetchMock);
    const discovery = new ServiceDiscovery();

    await expect(discovery.init()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.media.test.dev-gutools.co.uk",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(discovery.imageUrl("abc/123")).toBe("https://api.media.test.dev-gutools.co.uk/images/abc%2F123");
  });

  it("distinguishes a loaded root without the relation from a failed root", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => root([{ rel: "search", href: "https://media.example.test/images{?q}" }])));
    const loaded = new ServiceDiscovery();
    await expect(loaded.init()).resolves.toBe(true);
    expect(loaded.getLink("search")).toBeDefined();
    expect(loaded.getLink("ai-search")).toBeUndefined();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const failed = new ServiceDiscovery();
    await expect(failed.init()).resolves.toBe(false);
    expect(failed.getLinks()).toEqual([]);
  });

  it.each([
    ["refused", () => Promise.resolve(new Response(null, { status: 401 }))],
    ["unreachable", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["unreadable", () => Promise.resolve(new Response("not json"))],
  ] as const)("treats a %s root as absence for the session, without retrying", async (_label, answer) => {
    const fetchMock = vi.fn(answer);
    vi.stubGlobal("fetch", fetchMock);
    const discovery = new ServiceDiscovery();

    await expect(discovery.init()).resolves.toBe(false);
    await expect(discovery.init()).resolves.toBe(false);
    expect(discovery.getLink("ai-search")).toBeUndefined();
    expect(discovery.getClientConfig()).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
