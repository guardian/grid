import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const metadataOrigin = "https://metadata.example.test";
const authOrigin = "https://auth.example.test";
const command = {
  operation: "add-labels",
  imageId: "fixture",
  resource: { links: [{ rel: "edits", href: `${metadataOrigin}/metadata/fixture` }] },
  labels: ["fixture label"],
};
const root = () => Response.json({ links: [{ rel: "session", href: `${authOrigin}/session` }] });
const session = () => Response.json({ data: { user: { permissions: {} } } });
const edits = (uri = `${metadataOrigin}/metadata/fixture/labels`) => Response.json({ data: { labels: { uri, data: [] } } });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MEDIA_API", "true");
  vi.stubEnv("VITE_GRID_API_WRITES_ENABLED", "true");
  vi.stubEnv("VITE_GRID_API_OPERATIONS", "add-labels");
  vi.stubEnv("VITE_GRID_METADATA_ORIGIN", metadataOrigin);
  vi.stubEnv("VITE_GRID_AUTH_ORIGIN", authOrigin);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Grid command admission", () => {
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

  it("dispatches nothing for disabled, unknown, malformed or direct-ES commands", async () => {
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    for (const invalid of [{ ...command, operation: "delete" }, { ...command, method: "DELETE" }, { ...command, labels: [] },
      { ...command, resource: { links: [] } }, { ...command, imageId: "other" }]) {
      expect((await executeGridCommand(invalid)).outcome).toBe("blocked");
    }
    vi.stubEnv("VITE_GRID_API_OPERATIONS", "unknown");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    vi.stubEnv("VITE_GRID_API_OPERATIONS", "add-labels");
    vi.stubEnv("VITE_GRID_AUTH_ORIGIN", "");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    vi.stubEnv("VITE_GRID_AUTH_ORIGIN", authOrigin);
    vi.stubEnv("VITE_GRID_API_WRITES_ENABLED", "false");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    vi.stubEnv("VITE_GRID_API_WRITES_ENABLED", "true");
    vi.stubEnv("VITE_USE_MEDIA_API", "false");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport).not.toHaveBeenCalled();
  });

  it("uses hosted configuration only and rechecks rollout before dispatch", async () => {
    vi.stubEnv("VITE_HOSTED", "true");
    const config = {
      mediaApiUri: "https://api.example.test", metadataEditorUri: metadataOrigin, authUri: authOrigin,
      mutations: { enabled: true, operations: ["add-labels"] },
    };
    const host: { __KUPUA_CONFIG__?: typeof config } = {};
    vi.stubGlobal("window", host);
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport).not.toHaveBeenCalled();
    host.__KUPUA_CONFIG__ = config;
    transport.mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockImplementationOnce(async () => {
      config.mutations.enabled = false;
      return edits();
    });
    expect((await executeGridCommand(command)).outcome).toBe("blocked");
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test", `${authOrigin}/session`, `${metadataOrigin}/metadata/fixture`,
    ]);
    config.mutations.enabled = true;
    transport.mockResolvedValueOnce(edits()).mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect((await executeGridCommand(command)).outcome).toBe("acknowledged");
    expect(transport).toHaveBeenLastCalledWith(`${metadataOrigin}/metadata/fixture/labels`, expect.objectContaining({ method: "POST" }));
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
    [503, { outcome: "unknown" }],
    [403, { outcome: "rejected", status: 403, errorKey: "permission-denied" }],
  ])("classifies HTTP %s without replaying the submitted write", async (status, expected) => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockResolvedValueOnce(edits()).mockResolvedValueOnce(Response.json({ errorKey: "permission-denied" }, { status: status as number }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand } = await import("./grid-commands");
    await expect(executeGridCommand(command)).resolves.toEqual(expected);
    expect(transport.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
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

  it("honors the emergency stop while prerequisite reads are pending", async () => {
    let release!: (value: Response) => void;
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session())
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", transport);
    const { executeGridCommand, stopGridMutations } = await import("./grid-commands");
    const pending = executeGridCommand(command);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(3));
    stopGridMutations();
    release(edits());
    expect((await pending).outcome).toBe("blocked");
    expect(transport).toHaveBeenCalledTimes(3);
  });
});