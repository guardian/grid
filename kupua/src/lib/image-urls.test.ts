import { afterEach, describe, expect, it, vi } from "vitest";
import type { Image } from "@/types/image";

const RETURNED_THUMB = "https://thumbs.example.test/a/b/c/abc123";

const apiImage = {
  id: "abc123",
  source: { mimeType: "image/jpeg", dimensions: { width: 600, height: 400 } },
  thumbnail: { mimeType: "image/jpeg", dimensions: { width: 256, height: 171 }, secureUrl: RETURNED_THUMB },
} as Image;

async function loadWith(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  return import("./image-urls");
}

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("thumbnail delivery", () => {
  it("uses the returned thumbnail URL in canonical delivery, even with the S3 proxy running", async () => {
    const urls = await loadWith({ VITE_MEDIA_DELIVERY: "canonical", VITE_S3_PROXY_ENABLED: "true" });
    expect(urls.getThumbnailUrl(apiImage)).toBe(RETURNED_THUMB);
    expect(urls.thumbnailsEnabled).toBe(true);
  });

  it("reports absence when canonical delivery has no returned thumbnail URL", async () => {
    const urls = await loadWith({ VITE_MEDIA_DELIVERY: "canonical" });
    const withoutUrl = { ...apiImage, thumbnail: { ...apiImage.thumbnail!, secureUrl: undefined } } as Image;
    expect(urls.getThumbnailUrl(withoutUrl)).toBeUndefined();
    expect(urls.getThumbnailUrl({ ...apiImage, thumbnail: undefined } as Image)).toBeUndefined();
  });

  it("keeps the local S3 proxy by default and ignores returned URLs", async () => {
    const urls = await loadWith({ VITE_S3_PROXY_ENABLED: "true" });
    expect(urls.getThumbnailUrl(apiImage)).toBe("/s3/thumb/abc123");
    expect(urls.thumbnailsEnabled).toBe(true);
  });

  it("keeps thumbnails off without the proxy or canonical delivery", async () => {
    const urls = await loadWith({ VITE_S3_PROXY_ENABLED: "false" });
    expect(urls.getThumbnailUrl(apiImage)).toBeUndefined();
    expect(urls.thumbnailsEnabled).toBe(false);
  });
});

const OPTIMISED = "https://imgops.example.test/a/b/abc123?X-Amz-Signature=sig%2Fx{&w,h,q}&r=90";
const OPTIMISED_PNG = "https://imgops.example.test/png/abc123?X-Amz-Signature=png{&w,h,q}&r=0";

describe("full-image delivery", () => {
  const linked = { ...apiImage, __mediaLinks: { optimised: OPTIMISED } } as Image;

  it("expands the returned optimised link with size and quality, keeping server rotation", async () => {
    const urls = await loadWith({ VITE_MEDIA_DELIVERY: "canonical", VITE_IMGPROXY_ENABLED: "true", VITE_IMAGE_BUCKET: "bucket" });
    expect(urls.getFullImageUrl(linked, { width: 1200, height: 800, dpr: 1.5 })).toBe(
      "https://imgops.example.test/a/b/abc123?X-Amz-Signature=sig%2Fx&w=1800&h=1200&q=85&r=90",
    );
    expect(urls.getFullImageUrl(linked, { width: 400, height: 300, dpr: 1, quality: 70 })).toBe(
      "https://imgops.example.test/a/b/abc123?X-Amz-Signature=sig%2Fx&w=400&h=300&q=70&r=90",
    );
  });

  it("caps both requested sides at the longer native side, whatever the rotation", async () => {
    const urls = await loadWith({ VITE_MEDIA_DELIVERY: "canonical" });
    expect(urls.getFullImageUrl(linked, { width: 2000, height: 2000, dpr: 2, nativeWidth: 600, nativeHeight: 900 })).toBe(
      "https://imgops.example.test/a/b/abc123?X-Amz-Signature=sig%2Fx&w=900&h=900&q=85&r=90",
    );
  });

  it("prefers the optimised PNG link when media-api returns one", async () => {
    const urls = await loadWith({ VITE_MEDIA_DELIVERY: "canonical" });
    const png = { ...apiImage, __mediaLinks: { optimised: OPTIMISED, optimisedPng: OPTIMISED_PNG } } as Image;
    expect(urls.getFullImageUrl(png, { width: 100, height: 100, dpr: 1 })).toBe(
      "https://imgops.example.test/png/abc123?X-Amz-Signature=png&w=100&h=100&q=85&r=0",
    );
  });

  it("reports absence without a returned link or with an unsupported template, never falling back to imgproxy", async () => {
    const urls = await loadWith({ VITE_MEDIA_DELIVERY: "canonical", VITE_IMGPROXY_ENABLED: "true", VITE_IMAGE_BUCKET: "bucket" });
    expect(urls.getFullImageUrl(apiImage)).toBeUndefined();
    const odd = { ...apiImage, __mediaLinks: { optimised: "https://imgops.example.test/x{/w}" } } as Image;
    expect(urls.getFullImageUrl(odd)).toBeUndefined();
    expect(urls.getZoomImageUrl(apiImage)).toBeUndefined();
  });

  it("keeps imgproxy by default and ignores returned links", async () => {
    const urls = await loadWith({ VITE_IMGPROXY_ENABLED: "true", VITE_IMAGE_BUCKET: "bucket" });
    expect(urls.getFullImageUrl(linked, { width: 100, height: 100, dpr: 1 })).toMatch(/^\/imgproxy\/insecure\//);
  });
});
