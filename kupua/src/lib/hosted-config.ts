/**
 * Runtime configuration Kahuna injects as `window.__KUPUA_CONFIG__` when it serves
 * Kupua's page. Only hosted builds (VITE_HOSTED=true) read it; local modes never do.
 */

export interface HostedConfig {
  mediaApiUri?: string;
  collectionsUri?: string;
  /** The user's `show_paid` permission; drives initial/Home defaults only. */
  showPaid?: unknown;
  gridConfig?: unknown;
}

type ServiceUriKey = "mediaApiUri" | "collectionsUri";

export interface HostedFieldAlias {
  elasticsearchPath: string;
  alias: string;
  label: string;
  displaySearchHint: boolean;
  displayInAdditionalMetadata: boolean;
  searchHintOptions?: string[];
  matchViaExistence?: boolean;
}

export interface HostedTickerDefinition {
  name: string;
  searchClause: string;
  backgroundColour: string;
  subAggField?: string;
}

/** Validated site settings; a key is present only when Kahuna supplied a valid value. */
export interface HostedGridConfig {
  staffPhotographerOrganisation?: string;
  fieldAliases?: HostedFieldAlias[];
  imageTypes?: string[];
  recordDownloadAsUsage?: boolean;
  useReaper?: boolean;
  hasAgencyPicks?: boolean;
  agencyPicksIngredients?: Record<string, string[]>;
  agencyPicksColour?: string;
  tickerDefinitions?: HostedTickerDefinition[];
  showDenySyndicationWarning?: boolean;
  denySyndicationTextHeader?: string;
  defaultShouldBlurGraphicImages?: boolean;
}

declare global {
  interface Window {
    __KUPUA_CONFIG__?: HostedConfig;
  }
}

/** Kahuna route that clears the opt-in cookie and returns to Kahuna. */
export const KAHUNA_RETURN_PATH = "/kupua/off";

export function isHostedBuild(): boolean {
  return import.meta.env.VITE_HOSTED === "true";
}

/**
 * A service address from the injected config, as an https origin plus path with no
 * trailing slash. Undefined outside hosted builds or when absent/invalid.
 */
export function hostedServiceUri(key: ServiceUriKey): string | undefined {
  if (!isHostedBuild() || typeof window === "undefined") return undefined;
  const value = window.__KUPUA_CONFIG__?.[key];
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.search || url.hash) return undefined;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function injected(): HostedConfig | undefined {
  if (!isHostedBuild() || typeof window === "undefined") return undefined;
  return window.__KUPUA_CONFIG__;
}

/** Undefined when absent or invalid: callers keep their compatibility default. */
export function hostedShowPaid(): boolean | undefined {
  const value = injected()?.showPaid;
  return typeof value === "boolean" ? value : undefined;
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isNonEmptyString = (v: unknown): v is string => isString(v) && v.length > 0;
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const isOptional = <T>(v: unknown, check: (x: unknown) => x is T) => v === undefined || check(v);

function isFieldAlias(v: unknown): v is HostedFieldAlias {
  return isRecord(v) && isNonEmptyString(v.elasticsearchPath) && isNonEmptyString(v.alias) && isString(v.label)
    && isBoolean(v.displaySearchHint) && isBoolean(v.displayInAdditionalMetadata)
    && isOptional(v.searchHintOptions, isStringArray) && isOptional(v.matchViaExistence, isBoolean);
}

function isTicker(v: unknown): v is HostedTickerDefinition {
  return isRecord(v) && isNonEmptyString(v.name) && isNonEmptyString(v.searchClause)
    && isNonEmptyString(v.backgroundColour) && isOptional(v.subAggField, isNonEmptyString);
}

function isIngredients(v: unknown): v is Record<string, string[]> {
  return isRecord(v) && Object.values(v).every(isStringArray);
}

const arrayOf = <T>(check: (x: unknown) => x is T) => (v: unknown): v is T[] => Array.isArray(v) && v.every(check);

const validators: { [K in keyof HostedGridConfig]-?: (v: unknown) => boolean } = {
  staffPhotographerOrganisation: isNonEmptyString,
  fieldAliases: arrayOf(isFieldAlias),
  imageTypes: isStringArray,
  recordDownloadAsUsage: isBoolean,
  useReaper: isBoolean,
  hasAgencyPicks: isBoolean,
  agencyPicksIngredients: isIngredients,
  agencyPicksColour: isNonEmptyString,
  tickerDefinitions: arrayOf(isTicker),
  showDenySyndicationWarning: isBoolean,
  denySyndicationTextHeader: isString,
  defaultShouldBlurGraphicImages: isBoolean,
};

/** Supplied lists/maps replace local ones whole; any invalid entry rejects that whole setting. */
export function hostedGridConfig(): HostedGridConfig {
  const raw = injected()?.gridConfig;
  if (!isRecord(raw)) return {};
  const result: Rec = {};
  for (const [key, valid] of Object.entries(validators)) {
    if (valid(raw[key])) result[key] = raw[key];
  }
  return result as HostedGridConfig;
}
