import { describe, expect, it } from "vitest";
import {
  DEPLOYED_TEST_MEDIA_API_BASE_URL,
  mediaApiUrl,
  resolveMediaApiBaseUrl,
  shouldEnableDirectBedrockProxy,
} from "./proxy-target";

describe("media-api proxy target", () => {
  it("keeps the browser API base local unless deployed TEST is selected explicitly", () => {
    expect(resolveMediaApiBaseUrl(undefined)).toBe("/api");
    expect(resolveMediaApiBaseUrl("/api")).toBe("/api");
    expect(mediaApiUrl("/images", "/api")).toBe("/api/images");
    expect(mediaApiUrl("/images", DEPLOYED_TEST_MEDIA_API_BASE_URL)).toBe(
      "https://api.media.test.dev-gutools.co.uk/images",
    );
  });

  it.each(["", "https://api.media.example.com", "https://api.media.example"])(
    "refuses unsupported browser API base %j",
    (baseUrl) => expect(() => resolveMediaApiBaseUrl(baseUrl)).toThrow(`Unsupported media-api base URL: ${baseUrl}`),
  );

  it("refuses malformed media-api paths", () => {
    expect(() => mediaApiUrl("images", "/api")).toThrow("Invalid media-api path: images");
  });

  it("starts the direct Bedrock proxy only outside media-api mode", () => {
    expect(shouldEnableDirectBedrockProxy(undefined)).toBe(true);
    expect(shouldEnableDirectBedrockProxy("false")).toBe(true);
    expect(shouldEnableDirectBedrockProxy("true")).toBe(false);
    expect(shouldEnableDirectBedrockProxy(undefined, true)).toBe(false);
  });
});