import { createRequire } from "node:module";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";
import type { Plugin } from "vite";
import { requireSiteSettings, type SiteSettings } from "../src/lib/site-settings.ts";

const { Context } = createRequire(import.meta.url)("@pushcorn/hocon-parser") as {
  Context: new (options: { text: string; strict: boolean; env: boolean; required: boolean }) => {
    resolve(): Promise<unknown>;
    createContext(): unknown;
    resolveComponent(node: unknown, group: string, scope: unknown): Promise<unknown>;
  };
};

class InMemoryContext extends Context {
  override createContext(): never {
    throw new Error("Config includes are not supported");
  }

  override async resolveComponent(node: unknown, group: string, scope: unknown): Promise<unknown> {
    if (group === "transforms") throw new Error("Config transforms are not supported");
    return super.resolveComponent(node, group, scope);
  }
}

const CONFIG_KEYS = ["TEST/common.conf", "TEST/kahuna/kahuna.conf"] as const;
const MAX_CONFIG_BYTES = 1024 * 1024;
const FAILURE = "[config] TEST S3 site settings failed; check AWS credentials, config access and HOCON/settings validity.";
type ConfigObject = Record<string, unknown>;
const isObject = (value: unknown): value is ConfigObject => typeof value === "object" && value !== null && !Array.isArray(value);

function setting(config: ConfigObject, path: string[], fallback: unknown): unknown {
  let value: unknown = config;
  for (const key of path) {
    if (!isObject(value) || !Object.hasOwn(value, key)) return fallback;
    value = value[key];
  }
  return value;
}

export async function parseSiteSettings(common: string, kahuna: string): Promise<Required<SiteSettings>> {
  try {
    const config = await new InMemoryContext({ text: `${common}\n${kahuna}`, strict: true, env: false, required: true }).resolve();
    if (!isObject(config)) throw new Error();
    const organisation = setting(config, ["branding", "staffPhotographerOrganisation"], "GNM");
    const ingredients = setting(config, ["agencyPicks", "ingredients"], undefined);
    const colour = setting(config, ["agencyPicks", "colour"], "#7d0068");
    const aliases = setting(config, ["field", "aliases"], []);
    if (!Array.isArray(aliases)) throw new Error();
    const orgTicker = setting(config, ["filters", "shouldDisplayOrgOwnedCountAndFilterCheckbox"], true);
    if (typeof orgTicker !== "boolean") throw new Error();
    const hasAgencyPicks = ingredients !== undefined && ingredients !== null;
    return requireSiteSettings({
      staffPhotographerOrganisation: organisation,
      fieldAliases: aliases.map(alias => {
        if (!isObject(alias)) return alias;
        const options = alias.searchHintOptions ?? [];
        return {
          ...alias,
          displayInAdditionalMetadata: alias.displayInAdditionalMetadata ?? true,
          displaySearchHint: alias.displaySearchHint ?? false,
          searchHintOptions: Array.isArray(options) ? options.filter(option => option !== "") : options,
          matchViaExistence: alias.matchViaExistence ?? false,
        };
      }),
      imageTypes: setting(config, ["imageTypes"], []),
      recordDownloadAsUsage: setting(config, ["image", "record", "download"], false),
      useReaper: setting(config, ["useReaper"], false),
      hasAgencyPicks,
      agencyPicksIngredients: hasAgencyPicks ? ingredients : {},
      agencyPicksColour: colour,
      tickerDefinitions: [
        ...(orgTicker ? [{ name: `${organisation}-owned`, searchClause: `is:${organisation}-owned`, backgroundColour: "#005689" }] : []),
        ...(hasAgencyPicks ? [{ name: "agency picks", searchClause: "is:agency-pick", backgroundColour: colour, subAggField: "usageRights.supplier" }] : []),
      ],
      showDenySyndicationWarning: setting(config, ["showDenySyndicationWarning"], false),
      denySyndicationTextHeader: setting(config, ["warningText", "denySyndicationHeader"], "Syndication denied"),
      defaultShouldBlurGraphicImages: setting(config, ["defaultShouldBlurGraphicImages"], true),
    });
  } catch {
    throw new Error(FAILURE);
  }
}

async function readTestConfig(key: string): Promise<string> {
  const client = new S3Client({
    region: "eu-west-1", maxAttempts: 1,
    credentials: fromIni({ profile: process.env.AWS_PROFILE ?? "media-service" }),
  });
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: "grid-conf", Key: key }), { abortSignal: AbortSignal.timeout(15_000) });
    if (!response.Body || (response.ContentLength ?? Infinity) > MAX_CONFIG_BYTES) throw new Error();
    const text = await response.Body.transformToString();
    if (Buffer.byteLength(text) > MAX_CONFIG_BYTES) throw new Error();
    return text;
  } finally {
    client.destroy();
  }
}

export async function loadTestSiteSettings(readConfig: (key: string) => Promise<string> = readTestConfig): Promise<Required<SiteSettings>> {
  try {
    const common = await readConfig(CONFIG_KEYS[0]);
    const kahuna = await readConfig(CONFIG_KEYS[1]);
    return await parseSiteSettings(common, kahuna);
  } catch {
    throw new Error(FAILURE);
  }
}

export function siteSettingsPlugin(settings: Required<SiteSettings>) {
  const json = JSON.stringify({ gridConfig: requireSiteSettings(settings) }).replace(/</g, "\\u003c");
  return {
    name: "grid-site-settings",
    transformIndexHtml: {
      order: "pre",
      handler: () => [{ tag: "script", children: `window.__KUPUA_CONFIG__=${json};`, injectTo: "head-prepend" }],
    },
  } satisfies Plugin;
}