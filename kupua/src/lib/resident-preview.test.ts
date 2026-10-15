import { afterEach, describe, expect, it, vi } from "vitest";
import type { Image } from "@/types/image";

const image = { id: "sample-image", source: { dimensions: { width: 600, height: 400 } } } as Image;

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("resident preview modes", () => {
  it("retains synthetic images in the original preview", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_JUSTIFIED_PREVIEW", "true");
    vi.resetModules();
    const flags = await import("./resident-preview");
    const urls = await import("./image-urls");
    expect(flags.RESIDENT_PREVIEW_ENABLED).toBe(true);
    expect(flags.SAMPLED_PREVIEW_ENABLED).toBe(false);
    expect(urls.getThumbnailUrl(image)).toMatch(/^data:image\/svg\+xml/);
  });

  it("uses the existing thumbnail proxy for real-photo samples", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_JUSTIFIED_PREVIEW", "sample");
    vi.stubEnv("VITE_S3_PROXY_ENABLED", "true");
    vi.resetModules();
    const flags = await import("./resident-preview");
    const urls = await import("./image-urls");
    expect(flags.SAMPLED_PREVIEW_ENABLED).toBe(true);
    expect(flags.RESIDENT_PREVIEW_ENABLED).toBe(true);
    expect(flags.SYNTHETIC_PREVIEW_ENABLED).toBe(false);
    expect(urls.getThumbnailUrl(image)).toBe("/s3/thumb/sample-image");
  });

  it("does not silently substitute synthetic pictures when the real proxy is unavailable", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_JUSTIFIED_PREVIEW", "sample");
    vi.stubEnv("VITE_S3_PROXY_ENABLED", "false");
    vi.resetModules();
    const urls = await import("./image-urls");
    expect(urls.getThumbnailUrl(image)).toBeUndefined();
    expect(urls.thumbnailsEnabled).toBe(false);
  });

  it.each(["", "live"])("enables normal development presentation without resident data (%s)", async mode => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_JUSTIFIED_PREVIEW", mode);
    vi.resetModules();
    const flags = await import("./resident-preview");
    expect(flags.WINDOWED_JUSTIFIED_ENABLED).toBe(true);
    expect(flags.JUSTIFIED_AVAILABLE).toBe(true);
    expect(flags.RESIDENT_PREVIEW_ENABLED).toBe(false);
    expect(flags.SAMPLED_PREVIEW_ENABLED).toBe(false);
    expect(flags.SYNTHETIC_PREVIEW_ENABLED).toBe(false);
  });

  it.each(["true", "sample", "live"])("disables preview mode %s outside development", async mode => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_JUSTIFIED_PREVIEW", mode);
    vi.resetModules();
    const flags = await import("./resident-preview");
    expect(flags.RESIDENT_PREVIEW_ENABLED).toBe(false);
    expect(flags.JUSTIFIED_AVAILABLE).toBe(false);
    expect(flags.WINDOWED_JUSTIFIED_ENABLED).toBe(false);
  });
});
