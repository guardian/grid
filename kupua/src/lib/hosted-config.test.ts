// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { hostedServiceUri } from "./hosted-config";
import { mediaApiUrl } from "@/dal/grid-api/proxy-target";

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.__KUPUA_CONFIG__;
});

describe("hosted configuration", () => {
  it("is ignored outside hosted builds, leaving local media-api routing unchanged", () => {
    window.__KUPUA_CONFIG__ = { mediaApiUri: "https://api.media.example.test" };
    expect(hostedServiceUri("mediaApiUri")).toBeUndefined();
    expect(mediaApiUrl("/images", "/api")).toBe("/api/images");
  });

  it("routes hosted media-api reads to Kahuna's injected address", () => {
    vi.stubEnv("VITE_HOSTED", "true");
    window.__KUPUA_CONFIG__ = { mediaApiUri: "https://api.media.example.test/", collectionsUri: "https://media-collections.example.test" };
    expect(mediaApiUrl("/images/search-after", "/api")).toBe("https://api.media.example.test/images/search-after");
    expect(mediaApiUrl("")).toBe("https://api.media.example.test");
    expect(hostedServiceUri("collectionsUri")).toBe("https://media-collections.example.test");
  });

  it.each([
    undefined,
    "http://api.media.example.test",
    "https://api.media.example.test?x=1",
    "not a url",
  ])("refuses hosted media-api reads with address %j instead of falling back", (mediaApiUri) => {
    vi.stubEnv("VITE_HOSTED", "true");
    window.__KUPUA_CONFIG__ = mediaApiUri === undefined ? {} : { mediaApiUri };
    expect(hostedServiceUri("mediaApiUri")).toBeUndefined();
    expect(() => mediaApiUrl("/images", "/api")).toThrow("Hosted Kupua has no media-api address from Kahuna");
  });

  it("refuses hosted reads when Kahuna injected nothing", () => {
    vi.stubEnv("VITE_HOSTED", "true");
    expect(() => mediaApiUrl("/images")).toThrow("Hosted Kupua has no media-api address from Kahuna");
  });
});
