import { afterEach, describe, expect, it, vi } from "vitest";
import type { Connect } from "vite";
import { GRID_API_READ_VIA_POST, isGridApiReadViaPost } from "./read-via-post";

afterEach(() => vi.unstubAllEnvs());

it("does not let the global rollout switch bypass the Vite operation guard", async () => {
  vi.stubEnv("VITE_GRID_API_WRITES_ENABLED", "true");
  vi.stubEnv("VITE_GRID_METADATA_ORIGIN", "https://metadata.example.test");
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: "vite.config.ts",
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
    vi.stubEnv("VITE_GRID_API_OPERATIONS", "add-labels");
    metadataGuard({ method: "POST", url: "/metadata/fixture/labels" } as never, response as never, next);
    expect(next).toHaveBeenCalledOnce();
    next.mockClear();
    for (const request of [
      { method: "DELETE", url: "/metadata/fixture/labels" },
      { method: "POST", url: "/metadata/fixture/labels/extra" },
      { method: "POST", url: "/images/count" },
    ]) metadataGuard(request as never, response as never, next);
    expect(next).not.toHaveBeenCalled();
    vi.stubEnv("VITE_GRID_API_OPERATIONS", "");
    metadataGuard({ method: "POST", url: "/metadata/fixture/labels" } as never, response as never, next);
    expect(next).not.toHaveBeenCalled();
  } finally {
    await server.close();
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
