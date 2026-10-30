// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { hostedGridConfig, hostedServiceUri, hostedShowPaid } from "./hosted-config";
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

const alias = {
  elasticsearchPath: "fileMetadata.xmp.acme:thing", label: "Acme Thing", alias: "acmeThing",
  displaySearchHint: true, displayInAdditionalMetadata: true, searchHintOptions: ["x"], matchViaExistence: true,
};
const siteSettings = {
  staffPhotographerOrganisation: "ACME",
  fieldAliases: [alias],
  imageTypes: ["Handout"],
  recordDownloadAsUsage: true,
  useReaper: true,
  hasAgencyPicks: false,
  agencyPicksIngredients: {},
  agencyPicksColour: "#123456",
  tickerDefinitions: [{ name: "ACME-owned", searchClause: "is:ACME-owned", backgroundColour: "#005689" }],
  showDenySyndicationWarning: false,
  denySyndicationTextHeader: "Acme denied",
  defaultShouldBlurGraphicImages: false,
};

describe("hosted site settings", () => {
  it("are ignored outside hosted builds", () => {
    window.__KUPUA_CONFIG__ = { gridConfig: siteSettings, showPaid: false };
    expect(hostedGridConfig()).toEqual({});
    expect(hostedShowPaid()).toBeUndefined();
  });

  it("accept every supported setting, including explicit false and empty values", () => {
    vi.stubEnv("VITE_HOSTED", "true");
    window.__KUPUA_CONFIG__ = { gridConfig: siteSettings, showPaid: false };
    expect(hostedGridConfig()).toEqual(siteSettings);
    expect(hostedShowPaid()).toBe(false);
  });

  it("drop invalid fields wholesale, keep valid ones and ignore unknown keys", () => {
    vi.stubEnv("VITE_HOSTED", "true");
    window.__KUPUA_CONFIG__ = {
      showPaid: "yes",
      gridConfig: {
        ...siteSettings,
        staffPhotographerOrganisation: "",
        fieldAliases: [alias, { ...alias, alias: 7 }],
        imageTypes: ["ok", 3],
        useReaper: "true",
        agencyPicksIngredients: { "metadata.title": ["ok"], "metadata.keywords": "bad" },
        tickerDefinitions: [{ name: "x", searchClause: "is:x" }],
        unknownSetting: 1,
      },
    };
    expect(hostedShowPaid()).toBeUndefined();
    const { staffPhotographerOrganisation, fieldAliases, imageTypes, useReaper, agencyPicksIngredients, tickerDefinitions, ...valid } = siteSettings;
    void [staffPhotographerOrganisation, fieldAliases, imageTypes, useReaper, agencyPicksIngredients, tickerDefinitions];
    expect(hostedGridConfig()).toEqual(valid);
  });

  it("tolerate an old two-address payload or a non-object gridConfig", () => {
    vi.stubEnv("VITE_HOSTED", "true");
    window.__KUPUA_CONFIG__ = { mediaApiUri: "https://api.media.example.test" };
    expect(hostedGridConfig()).toEqual({});
    window.__KUPUA_CONFIG__ = { gridConfig: ["nope"] };
    expect(hostedGridConfig()).toEqual({});
  });
});

describe("grid config from the hosted page", () => {
  afterEach(() => { vi.resetModules(); });

  async function loadWith(config: Window["__KUPUA_CONFIG__"]) {
    vi.resetModules();
    vi.stubEnv("VITE_HOSTED", "true");
    window.__KUPUA_CONFIG__ = config;
    return {
      gridConfig: (await import("./grid-config")).gridConfig,
      typeahead: await import("./typeahead-fields"),
      registry: await import("./field-registry"),
      blur: await import("./graphic-image-blur"),
    };
  }

  it("reaches module-time consumers on first evaluation, replacing local lists", async () => {
    const { gridConfig, typeahead, registry, blur } = await loadWith({ gridConfig: siteSettings });
    expect(gridConfig.staffPhotographerOrganisation).toBe("ACME");
    expect(gridConfig["image.record.download"]).toBe(true);
    expect(gridConfig.fieldAliases).toEqual([alias]);
    expect(gridConfig.agencyPicksIngredients).toEqual({});
    expect(gridConfig.tickerDefinitions).toEqual(siteSettings.tickerDefinitions);
    expect(typeahead.buildIsOptions()).toEqual([
      "ACME-owned-photo", "ACME-owned-illustration", "ACME-owned", "under-quota", "deleted", "reapable",
    ]);
    const aliasIds = registry.FIELD_REGISTRY.filter((f) => f.group === "alias").map((f) => f.id);
    expect(aliasIds).toEqual(["alias_acmeThing"]);
    expect(blur.isImagePotentiallyGraphic({ metadata: { description: "graphic content" } } as never)).toBe(false);
  });

  it("keeps local defaults for an old payload", async () => {
    const { gridConfig, blur } = await loadWith({ mediaApiUri: "https://api.media.example.test" });
    expect(gridConfig.staffPhotographerOrganisation).toBe("GNM");
    expect(gridConfig.hasAgencyPicks).toBe(true);
    expect(gridConfig.fieldAliases.length).toBeGreaterThan(1);
    expect(blur.isImagePotentiallyGraphic({ metadata: { description: "graphic content" } } as never)).toBe(true);
  });
});
