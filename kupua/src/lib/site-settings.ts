export interface SiteFieldAlias {
  elasticsearchPath: string;
  alias: string;
  label: string;
  displaySearchHint: boolean;
  displayInAdditionalMetadata: boolean;
  searchHintOptions?: string[];
  matchViaExistence?: boolean;
}

export interface SiteTickerDefinition {
  name: string;
  searchClause: string;
  backgroundColour: string;
  subAggField?: string;
}

export interface SiteSettings {
  staffPhotographerOrganisation?: string;
  fieldAliases?: SiteFieldAlias[];
  imageTypes?: string[];
  recordDownloadAsUsage?: boolean;
  useReaper?: boolean;
  hasAgencyPicks?: boolean;
  agencyPicksIngredients?: Record<string, string[]>;
  agencyPicksColour?: string;
  tickerDefinitions?: SiteTickerDefinition[];
  showDenySyndicationWarning?: boolean;
  denySyndicationTextHeader?: string;
  defaultShouldBlurGraphicImages?: boolean;
}

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNonEmptyString = (value: unknown) => isString(value) && value.length > 0;
const isBoolean = (value: unknown) => typeof value === "boolean";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

function isAlias(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.elasticsearchPath) && isNonEmptyString(value.alias) && isString(value.label)
    && isBoolean(value.displaySearchHint) && isBoolean(value.displayInAdditionalMetadata)
    && (value.searchHintOptions === undefined || isStringArray(value.searchHintOptions))
    && (value.matchViaExistence === undefined || isBoolean(value.matchViaExistence));
}

function isTicker(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.name) && isNonEmptyString(value.searchClause) && isNonEmptyString(value.backgroundColour)
    && (value.subAggField === undefined || isNonEmptyString(value.subAggField));
}

const validators: Record<keyof SiteSettings, (value: unknown) => boolean> = {
  staffPhotographerOrganisation: isNonEmptyString,
  fieldAliases: value => Array.isArray(value) && value.every(isAlias),
  imageTypes: isStringArray,
  recordDownloadAsUsage: isBoolean,
  useReaper: isBoolean,
  hasAgencyPicks: isBoolean,
  agencyPicksIngredients: value => isRecord(value) && Object.values(value).every(isStringArray),
  agencyPicksColour: isNonEmptyString,
  tickerDefinitions: value => Array.isArray(value) && value.every(isTicker),
  showDenySyndicationWarning: isBoolean,
  denySyndicationTextHeader: isString,
  defaultShouldBlurGraphicImages: isBoolean,
};

export function validateSiteSettings(raw: unknown): SiteSettings {
  if (!isRecord(raw)) return {};
  const result: RecordValue = {};
  for (const [key, valid] of Object.entries(validators)) {
    if (valid(raw[key])) result[key] = raw[key];
  }
  if (Array.isArray(result.fieldAliases)) {
    result.fieldAliases = result.fieldAliases.map(({ elasticsearchPath, alias, label, displaySearchHint, displayInAdditionalMetadata, searchHintOptions, matchViaExistence }) => ({
      elasticsearchPath, alias, label, displaySearchHint, displayInAdditionalMetadata,
      ...(searchHintOptions !== undefined ? { searchHintOptions } : {}),
      ...(matchViaExistence !== undefined ? { matchViaExistence } : {}),
    }));
  }
  if (Array.isArray(result.tickerDefinitions)) {
    result.tickerDefinitions = result.tickerDefinitions.map(({ name, searchClause, backgroundColour, subAggField }) => ({
      name, searchClause, backgroundColour, ...(subAggField !== undefined ? { subAggField } : {}),
    }));
  }
  return result as SiteSettings;
}

export function requireSiteSettings(raw: unknown): Required<SiteSettings> {
  const result = validateSiteSettings(raw);
  if (Object.keys(result).length !== Object.keys(validators).length) throw new Error("Invalid Grid site settings");
  return result as Required<SiteSettings>;
}

export function siteSettings(): SiteSettings {
  if (typeof window === "undefined") return {};
  if (import.meta.env.VITE_HOSTED !== "true" && import.meta.env.VITE_USE_MEDIA_API !== "true") return {};
  return validateSiteSettings(window.__KUPUA_CONFIG__?.gridConfig);
}