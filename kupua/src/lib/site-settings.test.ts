import { afterEach, describe, expect, it, vi } from "vitest";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createServer } from "vite";
import { loadTestSiteSettings, parseSiteSettings, siteSettingsPlugin } from "../../scripts/test-site-settings.ts";

const common = `
branding.staffPhotographerOrganisation = ACME
field.aliases = [{
  elasticsearchPath = "fileMetadata.xmp.example:Flag"
  alias = exampleFlag
  label = Example Flag
  displaySearchHint = true
  displayInAdditionalMetadata = true
  matchViaExistence = true
}]
imageTypes = [Photograph, Illustration,]
image.record.download = true # comment
useReaper = true
defaultShouldBlurGraphicImages = false
agencyPicks {
  colour = "#123456"
  ingredients = { "metadata.description": ["editor pick"] }
}
showDenySyndicationWarning = false
privateSettings = "synthetic-private-value"
unusedTemplate { duration = 1 day }
unusedInstructions { PR Image = Example instructions }
`;
const kahuna = `
imageTypes = [Composite]
showDenySyndicationWarning = true
warningText.denySyndicationHeader = "Not for syndication"
`;

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("TEST site settings", () => {
  it("merges common then Kahuna HOCON and projects the complete hosted settings contract", async () => {
    const settings = await parseSiteSettings(common, kahuna);
    expect(settings).toEqual({
      upload: { transport: "direct" },
      staffPhotographerOrganisation: "ACME",
      fieldAliases: [{ elasticsearchPath: "fileMetadata.xmp.example:Flag", alias: "exampleFlag", label: "Example Flag",
        displaySearchHint: true, displayInAdditionalMetadata: true, searchHintOptions: [], matchViaExistence: true }],
      imageTypes: ["Composite"], recordDownloadAsUsage: true, useReaper: true, defaultShouldBlurGraphicImages: false,
      hasAgencyPicks: true, agencyPicksIngredients: { "metadata.description": ["editor pick"] }, agencyPicksColour: "#123456",
      tickerDefinitions: [
        { name: "ACME-owned", searchClause: "is:ACME-owned", backgroundColour: "#005689" },
        { name: "agency picks", searchClause: "is:agency-pick", backgroundColour: "#123456", subAggField: "usageRights.supplier" },
      ],
      showDenySyndicationWarning: true, denySyndicationTextHeader: "Not for syndication",
    });
    expect(JSON.stringify(settings)).not.toContain("synthetic-private-value");
  });

  it("projects upload topology and decimal byte limits without retaining storage configuration", async () => {
    const settings = await parseSiteSettings('s3.ingest.bucket="synthetic-private-value"\nupload.limit.mb=666', "");
    expect(settings.upload).toEqual({ transport: "signed", maxFileBytes: 666_000_000 });
    expect(JSON.stringify(settings)).not.toContain("synthetic-private-value");
  });

  it("preserves explicit false/empty values and mirrors hosted defaults and ticker gates", async () => {
    const settings = await parseSiteSettings("filters.shouldDisplayOrgOwnedCountAndFilterCheckbox=false\nimageTypes=[]", "");
    expect(settings).toMatchObject({ staffPhotographerOrganisation: "GNM", fieldAliases: [], imageTypes: [],
      tickerDefinitions: [], hasAgencyPicks: false, agencyPicksIngredients: {}, showDenySyndicationWarning: false,
      denySyndicationTextHeader: "Syndication denied", useReaper: false, recordDownloadAsUsage: false });
  });

  it("applies Grid's defaults to omitted alias display flags", async () => {
    const settings = await parseSiteSettings(`field.aliases=[{
      elasticsearchPath=metadata.example
      alias=example
      label=Example
    }]`, "");
    expect(settings.fieldAliases).toEqual([{ elasticsearchPath: "metadata.example", alias: "example", label: "Example",
      displayInAdditionalMetadata: true, displaySearchHint: false, searchHintOptions: [], matchViaExistence: false }]);
  });

  it("uses Grid's opaque agency-pick default for borders and tickers", async () => {
    const settings = await parseSiteSettings('agencyPicks.ingredients={"metadata.title":[pick]}', "");
    expect(settings.agencyPicksColour).toBe("#7d0068");
    expect(settings.tickerDefinitions.find(ticker => ticker.name === "agency picks")?.backgroundColour).toBe("#7d0068");
  });

  it("reads only the two approved objects, in precedence order, and sanitizes acquisition errors", async () => {
    const read = vi.fn().mockResolvedValueOnce(common).mockResolvedValueOnce(kahuna);
    await expect(loadTestSiteSettings(read)).resolves.toHaveProperty("imageTypes", ["Composite"]);
    expect(read.mock.calls).toEqual([["TEST/common.conf"], ["TEST/kahuna/kahuna.conf"]]);
    await expect(loadTestSiteSettings(async () => { throw new Error("synthetic-private-value"); })).rejects.toThrow(/^\[config\] TEST S3 site settings failed;/);
  });

  it("uses bounded SDK GetObject reads without exposing raw config", async () => {
    const send = vi.spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({ ContentLength: common.length, Body: { transformToString: async () => common } } as never)
      .mockResolvedValueOnce({ ContentLength: kahuna.length, Body: { transformToString: async () => kahuna } } as never);
    const destroy = vi.spyOn(S3Client.prototype, "destroy");
    await expect(loadTestSiteSettings()).resolves.toHaveProperty("imageTypes", ["Composite"]);
    expect(send.mock.calls.map(([command]) => ({ get: command instanceof GetObjectCommand, input: command.input }))).toEqual([
      { get: true, input: { Bucket: "grid-conf", Key: "TEST/common.conf" } },
      { get: true, input: { Bucket: "grid-conf", Key: "TEST/kahuna/kahuna.conf" } },
    ]);
    expect(send.mock.calls.every(call => call[1]?.abortSignal instanceof AbortSignal)).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(2);
    send.mockResolvedValueOnce({ ContentLength: 1024 * 1024 + 1 } as never);
    await expect(loadTestSiteSettings()).rejects.toThrow(/^\[config\]/);
  });

  it.each([
    'include required(file("/nonexistent/settings.conf"))',
    'include url("https://example.invalid/settings.conf")',
    'imageTypes=${KUPUA_SYNTHETIC_CONFIG}',
    'imageTypes="synthetic-private-value"',
    'field.aliases=[{elasticsearchPath=metadata.example\nalias=example\nlabel=Example\ndisplaySearchHint=invalid}]',
  ])("rejects unsafe or invalid input without returning parser excerpts: %s", async (input) => {
    vi.stubEnv("KUPUA_SYNTHETIC_CONFIG", "synthetic-private-value");
    await expect(parseSiteSettings(common, input)).rejects.toThrow(/^\[config\] TEST S3 site settings failed;/);
    await expect(parseSiteSettings(common, input)).rejects.not.toThrow("synthetic-private-value");
  });

  it("rejects primitive-value transforms before executing their expressions", async () => {
    const probe = vi.fn();
    const runtime = globalThis as typeof globalThis & { __kupuaConfigTransformProbe?: () => void };
    runtime.__kupuaConfigTransformProbe = probe;
    try {
      const outcome = await parseSiteSettings(common,
        'unusedReview="example" | eval { expr="(globalThis.__kupuaConfigTransformProbe(), resolution)" }')
        .then(() => "accepted", () => "rejected");
      expect(probe).not.toHaveBeenCalled();
      expect(outcome).toBe("rejected");
    } finally { delete runtime.__kupuaConfigTransformProbe; }
  });

  it("injects only validated settings and escapes script-closing text", async () => {
    const settings = await parseSiteSettings(common, 'warningText.denySyndicationHeader="</script><script>example</script>"');
    const plugin = siteSettingsPlugin({ ...settings, ignored: "synthetic-private-value" } as typeof settings);
    const tags = plugin.transformIndexHtml.handler();
    expect(tags[0].injectTo).toBe("head-prepend");
    expect(tags[0].children).not.toContain("</script>");
    expect(tags[0].children).not.toContain("synthetic-private-value");
    expect(tags[0].children).toContain("window.__KUPUA_CONFIG__=");
  });

  it("makes settings available before application modules in Vite HTML", async () => {
    const settings = await parseSiteSettings(common, kahuna);
    const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/site-settings-vite",
      server: { middlewareMode: true, hmr: false }, plugins: [siteSettingsPlugin(settings)] });
    try {
      const html = await server.transformIndexHtml("/", '<html><head></head><body><script type="module" src="/src/main.tsx"></script></body></html>');
      expect(html).toContain('src="/src/main.tsx"');
      expect(html.indexOf("window.__KUPUA_CONFIG__=")).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
      expect(html).toContain('"imageTypes":["Composite"]');
      expect(html).not.toContain("synthetic-private-value");
    } finally { await server.close(); }
  });
});