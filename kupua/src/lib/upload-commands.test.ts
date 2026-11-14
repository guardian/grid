import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const id = "a".repeat(40);
const loaderOrigin = "https://loader.example.test";
const authOrigin = "https://auth.example.test";
const file = Object.assign(new Blob(["fixture bytes"]), { name: "same name.jpg", lastModified: 0 }) as File;
const root = () => Response.json({ links: [{ rel: "loader", href: loaderOrigin }, { rel: "session", href: `${authOrigin}/session` }] });
const loader = () => Response.json({ links: [
  { rel: "prepare", href: `${loaderOrigin}/prepare` }, { rel: "uploadStatus", href: `${loaderOrigin}/uploadStatus/{id}` },
  { rel: "load", href: `${loaderOrigin}/images{?uploadedBy,identifiers,uploadTime,filename}` },
] });
const session = () => Response.json({ data: { user: { permissions: { canUpload: true } } } });
const digest = createHash("sha1").update("fixture bytes").digest("hex");
const storageTarget = new URL("https://kupua-fixture.s3.eu-west-1.amazonaws.com/synthetic/same.jpg");
storageTarget.search = new URLSearchParams({ "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Signature": "synthetic-not-a-signature",
  "X-Amz-Credential": "synthetic-not-a-credential", "X-Amz-Date": "20261114T000000Z", "X-Amz-Expires": "3600" }).toString();
const signedConfig = () => vi.stubGlobal("window", { __KUPUA_CONFIG__: { gridConfig: { upload: { transport: "signed" } } } });
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_USE_MEDIA_API", "true");
  vi.stubEnv("VITE_GRID_LOADER_ORIGIN", loaderOrigin);
  vi.stubEnv("VITE_GRID_AUTH_ORIGIN", authOrigin);
  vi.stubGlobal("localStorage", { getItem: () => "true" });
  vi.stubGlobal("window", { __KUPUA_CONFIG__: { gridConfig: { upload: { transport: "direct" } } } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Grid upload transport", () => {
  it("bounds a stalled visibility count so other upload observations can continue", async () => {
    const deadline = new AbortController();
    const owner = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const transport = vi.fn().mockResolvedValueOnce(Response.json({ data: { id } }))
      .mockImplementationOnce((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(new DOMException("Synthetic deadline", "AbortError")), { once: true });
      }));
    vi.stubGlobal("fetch", transport);
    const { observeUploadedImage } = await import("./upload-commands");
    const pending = observeUploadedImage(id, owner.signal);
    try {
      await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
      deadline.abort();
      expect(transport.mock.calls[1][1].signal.aborted).toBe(true);
      expect(await pending).toEqual({ outcome: "unavailable" });
    } finally { owner.abort(); await pending; }
  });

  it("keeps a readable image pending until indexed search visibility is confirmed, with uploads disabled", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const transport = vi.fn().mockResolvedValueOnce(Response.json({ data: { id } }))
      .mockResolvedValueOnce(Response.json({ total: 0 }))
      .mockResolvedValueOnce(Response.json({ data: { id } })).mockResolvedValueOnce(Response.json({ total: 1 }));
    vi.stubGlobal("fetch", transport);
    const { observeUploadedImage } = await import("./upload-commands");
    const signal = new AbortController().signal;
    expect(await observeUploadedImage(id, signal)).toEqual({ outcome: "missing" });
    expect(await observeUploadedImage(id, signal)).toEqual({ outcome: "visible" });
    expect(transport.mock.calls.map(([url]) => url)).toEqual([`/api/images/${id}`, "/api/images/count", `/api/images/${id}`, "/api/images/count"]);
    expect(JSON.parse(transport.mock.calls[1][1].body)).toEqual({ q: "", ids: [id] });
  });

  it("uses discovered hosted targets directly without enabling metadata editing", async () => {
    vi.stubEnv("VITE_HOSTED", "true");
    vi.stubGlobal("window", { __KUPUA_CONFIG__: { mediaApiUri: "https://api.example.test", gridConfig: { upload: { transport: "direct" } } } });
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === "kupua-allow-uploads" ? "true" : null });
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(loader())
      .mockResolvedValueOnce(Response.json({ uri: `${loaderOrigin}/uploadStatus/${id}` }, { status: 202 }));
    vi.stubGlobal("fetch", transport);
    const { submitGridUpload } = await import("./upload-commands");
    expect(await submitGridUpload(file, vi.fn(), new AbortController().signal)).toMatchObject({ outcome: "accepted" });
    expect(transport.mock.calls.map(([url]) => url)).toEqual(["https://api.example.test", `${authOrigin}/session`, `${loaderOrigin}/`, `${loaderOrigin}/images?filename=same+name.jpg`]);
  });

  it("refuses direct ES and missing topology, and admits the configured size boundary without a MIME filter", async () => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(loader())
      .mockResolvedValueOnce(Response.json({ uri: `${loaderOrigin}/uploadStatus/${id}` }, { status: 202 }));
    vi.stubGlobal("fetch", transport);
    const { submitGridUpload } = await import("./upload-commands");
    vi.stubEnv("VITE_USE_MEDIA_API", "false");
    expect(await submitGridUpload(file, vi.fn(), new AbortController().signal)).toMatchObject({ outcome: "blocked" });
    expect(transport).not.toHaveBeenCalled();
    vi.stubEnv("VITE_USE_MEDIA_API", "true");
    vi.stubGlobal("window", { __KUPUA_CONFIG__: { gridConfig: {} } });
    expect(await submitGridUpload(file, vi.fn(), new AbortController().signal)).toMatchObject({ outcome: "blocked" });
    vi.stubGlobal("window", { __KUPUA_CONFIG__: { gridConfig: { upload: { transport: "direct", maxFileBytes: file.size - 1 } } } });
    expect(await submitGridUpload(file, vi.fn(), new AbortController().signal)).toMatchObject({ outcome: "failed", stage: "preparation" });
    expect(transport.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    vi.stubGlobal("window", { __KUPUA_CONFIG__: { gridConfig: { upload: { transport: "direct", maxFileBytes: file.size } } } });
    expect(await submitGridUpload(file, vi.fn(), new AbortController().signal)).toMatchObject({ outcome: "accepted" });
  });

  it.each(["s3", "localstack"])("prepares SHA-1 identity and sends an abortable cookie-free %s PUT with separate QUEUED acknowledgement", async storage => {
    signedConfig();
    const target = storage === "s3" ? storageTarget.href : storageTarget.href.replace(storageTarget.origin, "https://localstack.media.local.dev-gutools.co.uk");
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(loader())
      .mockResolvedValueOnce(Response.json({ [digest]: target }))
      .mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(Response.json({ data: { status: "QUEUED" } }));
    vi.stubGlobal("fetch", transport);
    const { submitGridUpload } = await import("./upload-commands");
    const progress = vi.fn();
    const signal = new AbortController().signal;
    const result = await submitGridUpload(file, progress, signal);
    expect(result).toEqual({ outcome: "accepted", stage: "queued", imageId: digest, queued: "acknowledged" });
    expect(transport.mock.calls[3]).toEqual(["/grid-loader/prepare", expect.objectContaining({
      method: "POST", credentials: "include", redirect: "error", body: JSON.stringify({ [digest]: file.name }),
    })]);
    expect(transport.mock.calls[4]).toEqual([target, expect.objectContaining({
      method: "PUT", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", body: file, headers: { "x-amz-meta-media-id": digest },
    })]);
    expect(transport.mock.calls[4][1].signal).toBe(signal);
    expect(transport.mock.calls[5]).toEqual([`/grid-loader/uploadStatus/${digest}`, expect.objectContaining({ method: "POST", body: '{"status":"QUEUED"}' })]);
    expect(JSON.stringify({ result, progress: progress.mock.calls })).not.toContain("X-Amz");
  });

  it.each([
    ["prepare", 503, "uncertain", "preparation", undefined, 0, 0],
    ["put", 403, "failed", "transfer", undefined, 1, 0],
    ["put", 503, "uncertain", "transfer", undefined, 1, 0],
    ["queued", 400, "accepted", "queued", "rejected", 1, 1],
  ] as const)("keeps %s HTTP %s distinct without replay", async (failing, status, outcome, stage, queued, puts, queuedWrites) => {
    signedConfig();
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(loader())
      .mockResolvedValueOnce(failing === "prepare" ? new Response(null, { status }) : Response.json({ [digest]: storageTarget.href }))
      .mockResolvedValueOnce(new Response(null, { status: failing === "put" ? status : 200 }))
      .mockResolvedValueOnce(new Response(null, { status: failing === "queued" ? status : 200 }));
    vi.stubGlobal("fetch", transport);
    const { submitGridUpload } = await import("./upload-commands");
    expect(await submitGridUpload(file, vi.fn(), new AbortController().signal)).toMatchObject({ outcome, stage, ...(queued ? { queued } : {}) });
    expect(transport.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(puts);
    expect(transport.mock.calls.filter(([url, init]) => String(url).includes("uploadStatus") && init?.method === "POST")).toHaveLength(queuedWrites);
  });

  it("rechecks session invalidation after prepare and never dispatches or replays the signed PUT", async () => {
    signedConfig();
    let release!: (response: Response) => void;
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(loader())
      .mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
    vi.stubGlobal("fetch", transport);
    const { submitGridUpload } = await import("./upload-commands");
    const pending = submitGridUpload(file, vi.fn(), new AbortController().signal);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(4));
    (await import("./grid-api-instance")).invalidateGridSession();
    release(Response.json({ [digest]: storageTarget.href }));
    expect(await pending).toMatchObject({ outcome: "blocked", stage: "transfer" });
    expect(await submitGridUpload(file, vi.fn(), new AbortController().signal)).toMatchObject({ outcome: "blocked" });
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it("rejects foreign storage capabilities without sending bytes or exposing their contents", async () => {
    signedConfig();
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(loader())
      .mockResolvedValueOnce(Response.json({ [digest]: "https://foreign.example.test/secret-fixture-value" }));
    vi.stubGlobal("fetch", transport);
    const { submitGridUpload } = await import("./upload-commands");
    const result = await submitGridUpload(file, vi.fn(), new AbortController().signal);
    expect(result).toMatchObject({ outcome: "failed", stage: "preparation" });
    expect(JSON.stringify(result)).not.toContain("secret-fixture-value");
    expect(transport.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  });

  it("retains a lost direct-load acknowledgement as uncertain without replaying bytes", async () => {
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(loader())
      .mockRejectedValueOnce(new TypeError("synthetic-lost-response"));
    vi.stubGlobal("fetch", transport);
    const { submitGridUpload } = await import("./upload-commands");
    expect(await submitGridUpload(file, vi.fn(), new AbortController().signal)).toMatchObject({ outcome: "uncertain", stage: "transfer" });
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it("blocks every mutation without upload opt-in, even when editing is enabled", async () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === "kupua-allow-editing" ? "true" : null });
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const { submitGridUpload } = await import("./upload-commands");
    expect(await submitGridUpload(file, vi.fn(), new AbortController().signal)).toMatchObject({ outcome: "blocked" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("loads octet-stream with the encoded filename independently of editing admission", async () => {
    vi.stubGlobal("localStorage", { getItem: (key: string) => key === "kupua-allow-uploads" ? "true" : null });
    const transport = vi.fn().mockResolvedValueOnce(root()).mockResolvedValueOnce(session()).mockResolvedValueOnce(loader())
      .mockResolvedValueOnce(Response.json({ uri: `${loaderOrigin}/uploadStatus/${id}` }, { status: 202 }));
    vi.stubGlobal("fetch", transport);
    const { submitGridUpload } = await import("./upload-commands");
    const signal = new AbortController().signal;
    expect(await submitGridUpload(file, vi.fn(), signal)).toMatchObject({ outcome: "accepted", imageId: id });
    expect(transport).toHaveBeenLastCalledWith("/grid-loader/images?filename=same+name.jpg", expect.objectContaining({
      method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" }, credentials: "include", redirect: "error",
    }));
    expect(transport.mock.calls[3][1].signal).toBe(signal);
  });
});