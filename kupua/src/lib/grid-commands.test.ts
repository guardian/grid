import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const metadataOrigin = "https://metadata.example.test";
const authOrigin = "https://auth.example.test";
const command = {
  operation: "add-labels",
  imageId: "fixture",
  resource: { links: [{ rel: "edits", href: `${metadataOrigin}/metadata/fixture` }] },
  labels: ["fixture label"],
};
const root = () => Response.json({ links: [{ rel: "edits", href: metadataOrigin }, { rel: "session", href: `${authOrigin}/session` }] });
const session = () => Response.json({ data: { user: { permissions: {} } } });
const edits = (uri = `${metadataOrigin}/metadata/fixture/labels`) => Response.json({ data: { labels: { uri, data: [] } } });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MEDIA_API", "true");
  vi.stubGlobal("localStorage", { getItem: () => "true" });
  vi.stubEnv("VITE_GRID_METADATA_ORIGIN", metadataOrigin);
  vi.stubEnv("VITE_GRID_AUTH_ORIGIN", authOrigin);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Grid command admission", () => {
  it("uses discovered hosted services without injected addresses or rollout flags", async () => {
    vi.stubEnv("VITE_HOSTED", "true");
    vi.stubEnv("VITE_GRID_METADATA_ORIGIN", "");
    vi.stubEnv("VITE_GRID_AUTH_ORIGIN", "");
    vi.stubGlobal("window", { __KUPUA_CONFIG__: { mediaApiUri: "https://api.example.test" } });
    const transport = vi.fn().mockResolvedValueOnce(Response.json({ links: [
      { rel: "edits", href: metadataOrigin }, { rel: "session", href: `${authOrigin}/session` },
    ] })).mockResolvedValueOnce(session()).mockResolvedValueOnce(edits())
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand(command)).resolves.toEqual({ outcome: "acknowledged" });
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test", `${authOrigin}/session`, `${metadataOrigin}/metadata/fixture`,
      `${metadataOrigin}/metadata/fixture/labels`,
    ]);
  });

  it("captures one saved preference at startup and applies changes only after reload", async () => {
    let saved: string | null = "true";
    vi.stubGlobal("localStorage", { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } });
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const { gridLabelEditingEnabled } = await import("./grid-commands");
    const { saveEditingPreference } = await import("./editing-preference");
    expect(gridLabelEditingEnabled()).toBe(true);
    expect(saveEditingPreference(false)).toBe(true);
    expect(gridLabelEditingEnabled()).toBe(true);
    vi.resetModules();
    const reloaded = await import("./grid-commands");
    expect(reloaded.gridLabelEditingEnabled()).toBe(false);
    expect((await reloaded.executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport).not.toHaveBeenCalled();
  });

  it("reports an already absent label as unchanged without sending a mutation", async () => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(edits());
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand({ operation: "remove-label", imageId: command.imageId,
      resource: command.resource, label: "news" })).resolves.toEqual({ outcome: "unchanged" });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("removes only the exact advertised label resource and refuses absent or mismatched capabilities", async () => {
    const label = "news / + % ? #";
    const uri = `${metadataOrigin}/metadata/fixture/labels/news+%2F+%2B+%25+%3F+%23`;
    const removal = { operation: "remove-label", imageId: command.imageId, resource: command.resource, label };
    const response = (data: unknown[]) => Response.json({ data: { labels: { uri: `${metadataOrigin}/metadata/fixture/labels`, data } } });
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockResolvedValueOnce(response([{ uri, data: label }])).mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand(removal)).resolves.toEqual({ outcome: "acknowledged" });
    expect(transport).toHaveBeenLastCalledWith(uri.replace(metadataOrigin, "/grid-metadata"), expect.objectContaining({
      method: "DELETE", credentials: "include", redirect: "error",
    }));
    expect(transport.mock.calls.at(-1)?.[1].body).toBeUndefined();
    for (const data of [[{ data: label }],
      [{ uri: uri.replace("/fixture/", "/other/"), data: label }], [{ uri: uri.replace(metadataOrigin, "https://other.example.test"), data: label }]]) {
      transport.mockResolvedValueOnce(response(data));
      await expect(executeGridCommand(removal)).resolves.toMatchObject({ outcome: "blocked" });
    }
    expect(transport.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
  });

  it("bounds discovery already started by the page without replay or late dispatch", async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const transport = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
    }));
    vi.stubGlobal("fetch", transport);
    const { initGridApi } = await import("./grid-api-instance");
    const initialization = initGridApi();
    const { executeGridCommand } = await import("./grid-commands");
    const pending = executeGridCommand(command);
    expect(timeout).toHaveBeenCalledWith(15_000);
    deadline.abort();
    await initialization;
    expect((await pending).outcome).toBe("blocked");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport).toHaveBeenCalledOnce();
  });

  it("adds labels only through the authoritative collection, with credentials and no redirects", async () => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockResolvedValueOnce(edits()).mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand(command)).resolves.toEqual({ outcome: "acknowledged" });
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      "/api", "/grid-auth/session", "/grid-metadata/metadata/fixture", "/grid-metadata/metadata/fixture/labels",
    ]);
    expect(transport).toHaveBeenLastCalledWith("/grid-metadata/metadata/fixture/labels", expect.objectContaining({
      method: "POST", credentials: "include", redirect: "error", body: JSON.stringify({ data: command.labels }),
    }));
  });

  it("refuses malformed and direct-ES commands even with a saved enabled preference", async () => {
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    for (const invalid of [{ ...command, operation: "delete" }, { ...command, method: "DELETE" }, { ...command, labels: [] }]) {
      expect(await executeGridCommand(invalid)).toEqual({ outcome: "blocked", reason: "invalid-command" });
    }
    vi.stubEnv("VITE_USE_MEDIA_API", "false");
    expect(await executeGridCommand(command)).toEqual({ outcome: "blocked", reason: "disabled" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("defaults off when storage is absent or inaccessible", async () => {
    const storage = vi.fn().mockReturnValue(null);
    vi.stubGlobal("localStorage", { getItem: storage });
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    expect(await executeGridCommand(command)).toEqual({ outcome: "blocked", reason: "disabled" });
    storage.mockImplementation(() => { throw new Error("Storage unavailable"); });
    const { readEditingPreference } = await import("./editing-preference");
    expect(readEditingPreference()).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it("refuses unavailable directory services and mismatched local proxy targets", async () => {
    for (const links of [[], [{ rel: "edits", href: "http://metadata.example.test" }],
      [{ rel: "edits", href: metadataOrigin }, { rel: "session", href: `${authOrigin}/wrong` }]]) {
      vi.resetModules();
      const transport = vi.fn().mockResolvedValueOnce(Response.json({ links }));
      vi.stubGlobal("fetch", transport);
      const { executeGridCommand } = await import("./grid-commands");
      expect((await executeGridCommand(command)).outcome).toBe("blocked");
      expect(transport).toHaveBeenCalledOnce();
    }
    vi.resetModules();
    vi.stubEnv("VITE_GRID_METADATA_ORIGIN", "https://other.example.test");
    const transport = vi.fn().mockResolvedValueOnce(root());
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    expect(await executeGridCommand(command)).toEqual({ outcome: "blocked", reason: "invalid-command" });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("never follows a foreign labels resource or replays a lost write response", async () => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockResolvedValueOnce(edits("https://other.example.test/metadata/fixture/labels"));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport).toHaveBeenCalledTimes(3);
    transport.mockResolvedValueOnce(edits()).mockRejectedValueOnce(new TypeError("connection lost"));
    await expect(executeGridCommand(command)).resolves.toEqual({ outcome: "unknown" });
    expect(transport).toHaveBeenCalledTimes(5);
  });

  it.each([
    [429, { outcome: "unknown", status: 429 }],
    [503, { outcome: "unknown" }],
    [403, { outcome: "rejected", status: 403, errorKey: "permission-denied" }],
  ])("classifies HTTP %s without replaying the submitted write", async (status, expected) => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockResolvedValueOnce(Response.json({ data: { labels: { uri: `${metadataOrigin}/metadata/fixture/labels`,
        data: [{ uri: `${metadataOrigin}/metadata/fixture/labels/news`, data: "news" }] } } }))
      .mockResolvedValueOnce(Response.json({ errorKey: "permission-denied" }, { status: status as number }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand({ operation: "remove-label", imageId: command.imageId, resource: command.resource, label: "news" })).resolves.toEqual(expected);
    expect(transport.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it("stops pending and later submissions after expiry, even when a cached session was valid", async () => {
    let release!: (value: Response) => void;
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }))
      .mockResolvedValueOnce(edits()).mockResolvedValueOnce(Response.json({ errorKey: "authentication-expired" }, { status: 419 }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    const pending = executeGridCommand(command);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
    expect((await executeGridCommand(command)).outcome).toBe("rejected");
    release(edits());
    expect((await pending).outcome).toBe("blocked");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport).toHaveBeenCalledTimes(5);
    const { getGridSessionPermissions } = await import("./grid-api-instance");
    await expect(getGridSessionPermissions()).resolves.toBeNull();
  });

});