import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import type { Connect } from "vite";
import { gridMutationPlugin } from "../../../e2e/shared/grid-mutation-plugin";
import { GRID_API_READ_VIA_POST, isGridApiReadViaPost } from "./read-via-post";

afterEach(() => vi.unstubAllEnvs());

function fixtureRequest(mode: Parameters<typeof gridMutationPlugin>[0]) {
  const use = vi.fn<(handler: Connect.NextHandleFunction) => void>();
  const configure = gridMutationPlugin(mode).configureServer;
  if (typeof configure !== "function") throw new Error("Missing fixture middleware");
  configure.call({} as never, { middlewares: { use } } as never);
  const [[handler]] = use.mock.calls;
  return async (method: string, url: string, body?: unknown) => {
    const request = Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), { method, url });
    const response = { statusCode: 200, setHeader: vi.fn(), end: vi.fn<(text?: string) => void>() };
    const next = vi.fn();
    await handler(request as never, response as never, next);
    expect(next, `${method} ${url} reached downstream middleware`).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledOnce();
    return { status: response.statusCode, text: response.end.mock.calls[0][0] };
  };
}

it("blocks unhandled lease requests in the fixture without reaching a proxy", async () => {
  for (const mode of [false, true, "readback", "continuation", "upload"] as const) {
    const request = fixtureRequest(mode);
    for (const prefix of ["/grid-leases", "/grid-local-leases", "/grid-test-leases"]) {
      expect((await request("POST", `${prefix}/leases`)).status).toBe(403);
    }
  }
  const request = fixtureRequest("upload");
  await request("POST", "/__upload-control", { editing: true, members: [{ id: "fixture", name: "fixture.jpg" }] });
  for (const [method, url] of [
    ["GET", "/grid-local-leases/"], ["DELETE", "/grid-test-leases/leases/media/fixture"],
    ["GET", "/grid-leases/unsupported"], ["PUT", "/grid-leases/other/fixture"],
    ["DELETE", "/grid-leases/leases/reindex"], ["PATCH", "/grid-leases/leases/media/fixture"],
    ["DELETE", "/grid-leases/leases/media/fixture?all=true"],
  ]) expect((await request(method, url, [])).status).toBe(403);
});

it("reissues retained use terms when a fixture syndication POST replaces the previous decision", async () => {
  const request = fixtureRequest("upload");
  await request("POST", "/__upload-control", { editing: true });
  const post = async (access: string) => expect((await request("POST", "/grid-leases/leases", { mediaId: "local-0", access, notes: access })).status).toBe(202);
  const read = async (): Promise<{ id: string; access: string; notes: string }[]> => JSON.parse((await request("GET", "/grid-leases/leases/media/local-0")).text!).data.leases;
  await post("allow-syndication");
  const [previous] = await read();
  await post("deny-use");
  const [unchanged, retained] = await read();
  expect(unchanged).toEqual(previous);
  await post("deny-syndication");
  const replacements = await read();
  expect(replacements).toEqual([expect.objectContaining({ access: "deny-use", notes: retained.notes, id: expect.any(String) }),
    expect.objectContaining({ access: "deny-syndication", id: expect.any(String) })]);
  for (const { id } of replacements) expect([previous.id, retained.id]).not.toContain(id);
});

it("routes advertised local and TEST satellites independently without manual targets", async () => {
  vi.stubEnv("VITE_HOSTED", "false");
  vi.stubEnv("VITE_GRID_METADATA_ORIGIN", "");
  vi.stubEnv("VITE_GRID_AUTH_ORIGIN", "");
  vi.stubEnv("VITE_GRID_LOADER_ORIGIN", "");
  const { gridServiceUrl } = await import("./proxy-target");
  for (const environment of ["local", "test"]) {
    const metadata = `https://media-metadata.${environment}.dev-gutools.co.uk`;
    const auth = `https://media-auth.${environment}.dev-gutools.co.uk`;
    const cropper = `https://cropper.media.${environment}.dev-gutools.co.uk`;
    expect(gridServiceUrl("cropper", `${cropper}/crops/fixture`, "/crops/fixture", cropper))
      .toBe(environment === "test" ? `${cropper}/crops/fixture` : "/grid-local-cropper/crops/fixture");
    const leases = `https://media-leases.${environment}.dev-gutools.co.uk`;
    expect(gridServiceUrl("leases", `${leases}/leases`, "/leases", leases)).toBe(environment === "test" ? `${leases}/leases` : "/grid-local-leases/leases");
    const loader = `https://loader.media.${environment}.dev-gutools.co.uk`;
    expect(gridServiceUrl("metadata", `${metadata}/metadata/fixture`, "/metadata/fixture", metadata))
      .toBe(environment === "test" ? `${metadata}/metadata/fixture` : `/grid-local-metadata/metadata/fixture`);
    expect(gridServiceUrl("auth", `${auth}/session`, "/session", auth))
      .toBe(environment === "test" ? `${auth}/session` : `/grid-local-auth/session`);
    expect(gridServiceUrl("loader", `${loader}/prepare`, "/prepare", loader))
      .toBe(environment === "test" ? `${loader}/prepare` : "/grid-local-loader/prepare");
    const reversedLoader = `https://media-loader.${environment}.dev-gutools.co.uk`;
    expect(gridServiceUrl("loader", `${reversedLoader}/prepare`, "/prepare", reversedLoader)).toBeUndefined();
    expect(gridServiceUrl("metadata", `${auth}/metadata/fixture`, "/metadata/fixture", auth)).toBeUndefined();
    expect(gridServiceUrl("metadata", `${metadata}/metadata/other`, "/metadata/fixture", metadata)).toBeUndefined();
  }
  const foreign = "https://unexpected.example.test";
  expect(gridServiceUrl("metadata", `${foreign}/metadata/fixture`, "/metadata/fixture", foreign)).toBeUndefined();
  vi.stubEnv("VITE_HOSTED", "true");
  const local = "https://cropper.media.local.dev-gutools.co.uk";
  expect(gridServiceUrl("cropper", `${local}/crops/fixture`, "/crops/fixture", local)).toBe(`${local}/crops/fixture`);
});

it("forwards only the exact cropper discovery, save and saved-crop routes to LOCAL", async () => {
  vi.stubEnv("VITE_USE_MEDIA_API", "true");
  const { createServer } = await import("vite");
  const received: string[] = [];
  const list = { data: [{ id: "synthetic-saved-crop" }] };
  const upstream = createHttpServer((request, response) => {
    received.push(`${request.method} ${request.url}`);
    response.end(JSON.stringify(list));
  });
  const cacheDir = await mkdtemp(resolve("node_modules/.vite-read-guard-"));
  let vite: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    await new Promise<void>(done => upstream.listen(0, "127.0.0.1", done));
    const address = upstream.address();
    if (!address || typeof address === "string") throw new Error("Missing loopback address");
    vite = await createServer({ configFile: "vite.config.ts", cacheDir, optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: "127.0.0.1", port: 0 }, plugins: [{ name: "loopback-cropper", configResolved(config) {
        const proxies = config.server.proxy!;
        expect(Object.keys(proxies).filter(key => key.includes("cropper"))).toEqual(["^/grid-local-cropper/"]);
        const route = proxies["^/grid-local-cropper/"];
        expect(route).toMatchObject({ target: "https://cropper.media.local.dev-gutools.co.uk", followRedirects: false });
        if (typeof route !== "string") route.target = `http://127.0.0.1:${address.port}`;
      } }] });
    await vite.listen();
    const prefix = `${vite.resolvedUrls!.local[0]}grid-local-cropper`;
    expect(await (await fetch(`${prefix}/`)).json()).toEqual(list);
    expect(await (await fetch(`${prefix}/crops`, { method: "POST" })).json()).toEqual(list);
    expect(await (await fetch(`${prefix}/crops/fixture`)).json()).toEqual(list);
    for (const [method, path] of [["POST", "/crops/fixture"], ["DELETE", "/crops/fixture"], ["GET", "/management/healthcheck"],
      ["PUT", "/collections/news"], ["GET", "/crops/fixture/extra"], ["GET", "/crops/fixture?all=true"], ["POST", "/crops?all=true"]]) {
      expect((await fetch(prefix + path, { method })).status, `${method} ${path}`).toBe(403);
    }
    expect(received).toEqual(["GET /", "POST /crops", "GET /crops/fixture"]);
  } finally {
    await vite?.close();
    await new Promise<void>(done => upstream.close(() => done()));
    await rm(cacheDir, { recursive: true, force: true });
  }
});

it("admits only supported Vite transport shapes with startup-captured proxy targets", async () => {
  vi.stubEnv("VITE_USE_MEDIA_API", "true");
  vi.stubEnv("VITE_GRID_METADATA_ORIGIN", "https://metadata.example.test");
  vi.stubEnv("VITE_GRID_LOADER_ORIGIN", "https://loader.example.test");
  const { createServer } = await import("vite");
  // A middleware-only test must not invalidate a concurrently running app's optimizer cache.
  const cacheDir = await mkdtemp(resolve("node_modules/.vite-read-guard-"));
  const server = await createServer({
    configFile: "vite.config.ts",
    cacheDir,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
  });
  try {
    const guard = server.middlewares.stack.find((entry) => entry.route === "/api")?.handle as Connect.NextHandleFunction;
    expect(guard).toBeDefined();
    const response = { writeHead: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    guard({ method: "DELETE", url: "/images/fixture" } as never, response as never, next);
    expect(response.writeHead).toHaveBeenCalledWith(403, expect.anything());
    expect(next).not.toHaveBeenCalled();
    guard({ method: "POST", url: "/images/count?fixture=true" } as never, response as never, next);
    expect(next).toHaveBeenCalledOnce();
    next.mockClear();
    guard({ method: "POST", url: "/images/count/labels" } as never, response as never, next);
    expect(next).not.toHaveBeenCalled();
    const metadataGuard = server.middlewares.stack.find((entry) => entry.route === "/grid-metadata")?.handle as Connect.NextHandleFunction;
    expect(metadataGuard).toBeDefined();
    metadataGuard({ method: "POST", url: "/metadata/fixture/labels" } as never, response as never, next);
    expect(next).toHaveBeenCalledOnce();
    next.mockClear();
    metadataGuard({ method: "PUT", url: "/metadata/fixture/metadata" } as never, response as never, next);
    expect(next).toHaveBeenCalledOnce();
    next.mockClear();
    for (const request of [
      { method: "PUT", url: "/metadata/fixture" },
      { method: "PUT", url: "/metadata/fixture/metadata?target=other" },
      { method: "DELETE", url: "/metadata/fixture/labels" },
      { method: "POST", url: "/metadata/fixture/labels/extra" },
      { method: "POST", url: "/images/count" },
    ]) metadataGuard(request as never, response as never, next);
    expect(next).not.toHaveBeenCalled();
    metadataGuard({ method: "DELETE", url: "/metadata/fixture/labels/news+%2F+%2B" } as never, response as never, next);
    expect(next).toHaveBeenCalledOnce();
    next.mockClear();
    for (const request of [
      { method: "DELETE", url: "/metadata/fixture" },
      { method: "DELETE", url: "/metadata/fixture/labels" },
      { method: "DELETE", url: "/metadata/fixture/labels/news/extra" },
      { method: "DELETE", url: "/metadata/fixture/labels/news?extra=true" },
      { method: "DELETE", url: "/metadata/fixture/labels/%2E%2E" },
      { method: "DELETE", url: "/metadata/fixture/labels/%broken" },
    ]) metadataGuard(request as never, response as never, next);
    expect(next).not.toHaveBeenCalled();
    vi.stubEnv("VITE_GRID_METADATA_ORIGIN", "");
    metadataGuard({ method: "POST", url: "/metadata/fixture/labels" } as never, response as never, next);
    expect(next).toHaveBeenCalledOnce();
    const loaderGuard = server.middlewares.stack.find(entry => entry.route === "/grid-loader")?.handle as Connect.NextHandleFunction;
    expect(loaderGuard).toBeDefined();
    for (const request of [
      { method: "GET", url: "/" }, { method: "POST", url: "/prepare" },
      { method: "POST", url: "/images?filename=same+name.jpg" },
      { method: "GET", url: `/uploadStatus/${"a".repeat(40)}` }, { method: "POST", url: `/uploadStatus/${"a".repeat(40)}` },
    ]) {
      next.mockClear();
      loaderGuard(request as never, response as never, next);
      expect(next).toHaveBeenCalledOnce();
    }
    next.mockClear();
    for (const request of [
      { method: "PUT", url: "/images" }, { method: "POST", url: "/prepare/other" },
      { method: "GET", url: "/metadata/fixture" },
      { method: "POST", url: "/images?filename=a&uploadedBy=other" },
      { method: "POST", url: "/images?target=https://foreign.example.test" },
      { method: "DELETE", url: `/uploadStatus/${"a".repeat(40)}` },
    ]) loaderGuard(request as never, response as never, next);
    expect(next).not.toHaveBeenCalled();
    for (const environment of ["local", "test"]) {
      for (const service of ["metadata", "auth", "collections", "loader", "leases"]) {
        const prefix = `/grid-${environment}-${service}`;
        const proxy = server.config.server.proxy![`^${prefix}/`];
        if (environment === "test" && service === "collections") {
          expect(proxy).toBeUndefined();
          expect(server.middlewares.stack.some(entry => entry.route === prefix)).toBe(false);
          continue;
        }
        const hostname = service === "loader" ? "loader.media" : `media-${service}`;
        expect(proxy).toMatchObject({ target: `https://${hostname}.${environment}.dev-gutools.co.uk`, followRedirects: false,
          headers: { Origin: "https://media.local.dev-gutools.co.uk" } });
        if (prefix === "/grid-local-metadata") {
          expect(proxy).toMatchObject({ agent: { keepAlive: true }, headers: { Connection: "keep-alive" } });
        } else expect(proxy).not.toHaveProperty("agent");
        const fixedGuard = server.middlewares.stack.find(entry => entry.route === prefix)?.handle as Connect.NextHandleFunction;
        expect(fixedGuard).toBeDefined();
        next.mockClear();
        fixedGuard({ method: "GET", url: service === "auth" ? "/session" : service === "collections" ? "/collections" : service === "loader" || service === "leases" ? "/" : "/metadata/fixture" } as never, response as never, next);
        expect(next).toHaveBeenCalledOnce();
        next.mockClear();
        fixedGuard({ method: "POST", url: "/metadata/fixture/labels" } as never, response as never, next);
        expect(next).toHaveBeenCalledTimes(service === "metadata" ? 1 : 0);
        next.mockClear();
        fixedGuard({ method: "DELETE", url: "/metadata/fixture" } as never, response as never, next);
        fixedGuard({ method: "GET", url: "/session?target=https://unexpected.example.test" } as never, response as never, next);
        if (service === "collections") {
          fixedGuard({ method: "DELETE", url: "/collections" } as never, response as never, next);
          fixedGuard({ method: "GET", url: "/collections/other" } as never, response as never, next);
          expect(next).not.toHaveBeenCalled();
          for (const [method, url] of [["POST", "/collections"], ["POST", "/collections/Desk"], ["DELETE", "/collections/Desk/Finals"]]) {
            fixedGuard({ method, url } as never, response as never, next);
            expect(next).toHaveBeenCalledOnce(); next.mockClear();
          }
        }
        if (service === "leases") {
          fixedGuard({ method: "POST", url: "/leases/media/fixture" } as never, response as never, next);
          fixedGuard({ method: "DELETE", url: "/leases/media/fixture?all=true" } as never, response as never, next);
          fixedGuard({ method: "DELETE", url: "/leases/reindex" } as never, response as never, next);
          expect(next).not.toHaveBeenCalled();
          fixedGuard({ method: "PUT", url: "/leases/media/fixture" } as never, response as never, next);
          expect(next).toHaveBeenCalledOnce(); next.mockClear();
        }
        expect(next).not.toHaveBeenCalled();
      }
    }
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

it("does not register satellite proxies in direct-ES mode", async () => {
  vi.stubEnv("VITE_USE_MEDIA_API", "false");
  const { createServer } = await import("vite");
  const cacheDir = await mkdtemp(resolve("node_modules/.vite-read-guard-"));
  const server = await createServer({ configFile: "vite.config.ts", cacheDir,
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true } });
  try {
    expect(Object.keys(server.config.server.proxy!).filter(prefix => prefix.includes("/grid-"))).toEqual([]);
    expect(server.middlewares.stack.filter(entry => entry.route.startsWith("/grid-"))).toEqual([]);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

describe("Grid API read-via-POST allowlist", () => {
  it.each(GRID_API_READ_VIA_POST)("admits POST %s, with or without a query string", (path) => {
    expect(isGridApiReadViaPost("POST", path)).toBe(true);
    expect(isGridApiReadViaPost("POST", `${path}?include=usages`)).toBe(true);
  });

  it.each(GRID_API_READ_VIA_POST)("refuses a write route whose image id is %s", (path) => {
    expect(isGridApiReadViaPost("POST", `${path}/partner/true/syndicateImage`)).toBe(false);
    expect(isGridApiReadViaPost("POST", `${path}/`)).toBe(false);
    expect(isGridApiReadViaPost("POST", `${path}x`)).toBe(false);
  });

  it("admits the image lookup by ID", () => {
    expect(isGridApiReadViaPost("POST", "/images/mget")).toBe(true);
  });

  it("refuses other methods and unlisted paths", () => {
    expect(isGridApiReadViaPost("PUT", "/images/count")).toBe(false);
    expect(isGridApiReadViaPost("DELETE", "/images/keys")).toBe(false);
    expect(isGridApiReadViaPost("POST", "/images/abc/usages")).toBe(false);
    expect(isGridApiReadViaPost("POST", undefined)).toBe(false);
    expect(isGridApiReadViaPost(undefined, "/images/count")).toBe(false);
  });
});
