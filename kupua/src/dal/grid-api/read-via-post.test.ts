import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Connect } from "vite";
import { GRID_API_READ_VIA_POST, isGridApiReadViaPost } from "./read-via-post";

afterEach(() => vi.unstubAllEnvs());

it("routes advertised local and TEST satellites independently without manual targets", async () => {
  vi.stubEnv("VITE_HOSTED", "false");
  vi.stubEnv("VITE_GRID_METADATA_ORIGIN", "");
  vi.stubEnv("VITE_GRID_AUTH_ORIGIN", "");
  vi.stubEnv("VITE_GRID_LOADER_ORIGIN", "");
  const { gridServiceUrl } = await import("./proxy-target");
  for (const environment of ["local", "test"]) {
    const metadata = `https://media-metadata.${environment}.dev-gutools.co.uk`;
    const auth = `https://media-auth.${environment}.dev-gutools.co.uk`;
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
    for (const request of [
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
      for (const service of ["metadata", "auth", "collections", "loader"]) {
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
        const fixedGuard = server.middlewares.stack.find(entry => entry.route === prefix)?.handle as Connect.NextHandleFunction;
        expect(fixedGuard).toBeDefined();
        next.mockClear();
        fixedGuard({ method: "GET", url: service === "auth" ? "/session" : service === "collections" ? "/collections" : service === "loader" ? "/" : "/metadata/fixture" } as never, response as never, next);
        expect(next).toHaveBeenCalledOnce();
        next.mockClear();
        fixedGuard({ method: "POST", url: "/metadata/fixture/labels" } as never, response as never, next);
        expect(next).toHaveBeenCalledTimes(service === "metadata" ? 1 : 0);
        next.mockClear();
        fixedGuard({ method: "DELETE", url: "/metadata/fixture" } as never, response as never, next);
        fixedGuard({ method: "GET", url: "/session?target=https://unexpected.example.test" } as never, response as never, next);
        if (service === "collections") {
          fixedGuard({ method: "DELETE", url: "/collections" } as never, response as never, next);
          fixedGuard({ method: "POST", url: "/collections" } as never, response as never, next);
          fixedGuard({ method: "GET", url: "/collections/other" } as never, response as never, next);
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
