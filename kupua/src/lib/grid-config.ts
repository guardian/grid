/**
 * Mock Grid config — hardcoded values derived from exploration/mock/grid-config.conf.
 *
 * Eventually this should be read from a proper config store / API.
 * For now we hardcode the values so kupua's CQL parser and typeahead
 * resolvers can work identically to kahuna.
 */

interface FieldAlias {
  elasticsearchPath: string;
  alias: string;
  label: string;
  displaySearchHint: boolean;
  displayInAdditionalMetadata: boolean;
  searchHintOptions?: string[];
}

/**
 * A single ticker definition — drives filter aggregations in _doSearch and
 * badge rendering in StatusBar + Filters panel.
 */
export interface TickerDefinition {
  /** Display name shown in the badge (e.g. "GNM-owned", "agency picks"). */
  name: string;
  /** CQL clause applied when the badge is clicked (e.g. "is:GNM-owned"). */
  searchClause: string;
  /** CSS background colour for the badge. */
  backgroundColour: string;
  /**
   * When set, the ticker request also fetches top values for this ES field
   * (sub-aggregation). Currently only used by agency-picks ("usageRights.supplier").
   */
  subAggField?: string;
}

export const gridConfig = {
  /**
   * The organisation name used for `is:<org>-owned` style queries.
   * From `staffPhotographerOrganisation` in Grid config (default "GNM").
   */
  staffPhotographerOrganisation: "GNM",

  /**
   * Categories that qualify an image for the syndication "review" queue.
   * Mirrors `IsOwnedPhotograph` in IsQueryFilter.scala (UsageRights.photographer):
   *   NonEmptyList(StaffPhotographer, ContractPhotographer, CommissionedPhotographer)
   * Same three categories used for the blue border in image-borders.ts.
   * If Grid ever adds a new photographer category, update here.
   */
  syndicatableCategories: [
    "staff-photographer",
    "contract-photographer",
    "commissioned-photographer",
  ] as string[],

  /**
   * Earliest upload date for the syndication "review" filter (PROD only).
   * Mirrors `syndication.start` in MediaApiConfig.scala; applied only in PROD
   * to exclude the long tail of pre-syndication images.
   * Set to null for TEST/CODE (no cutoff), matching Scala's `case _ => rightsAcquiredNoLeaseFilter`.
   * Hardcoded for now — move to proper runtime config when that system is built.
   * (07-syndication-and-leases.md §4.2)
   */
  syndicationStartDate: null as string | null,

  /**
   * Whether to show a warning banner when a deny-syndication lease is active.
   * Mirrors Kahuna's `_clientConfig.showDenySyndicationWarning`.
   * Set to true by default — operators can override once runtime config is wired.
   */
  showDenySyndicationWarning: true,

  /**
   * Text shown in the deny-syndication warning banner.
   * Mirrors Kahuna's `_clientConfig.denySyndicationTextHeader`.
   */
  denySyndicationTextHeader: "This image has been denied for syndication.",


  /** Whether the reaper feature is enabled */
  useReaper: false,

  /** Whether agency pick filtering is available */
  hasAgencyPicks: true,

  /**
   * Agency picks detection — mirrors `agencyPicks.ingredients` in Grid config.
   * A map of ES field paths → keyword values whose presence flags an image as
   * an agency pick (editorial top-shot selected by the wire agency).
   * Used by `is:agency-pick` in cql.ts (filter aggregation + typeahead).
   * Source: agencyPicsConfigFragment.conf (redacted copy stored separately).
   */
  agencyPicksColour: "#7d006880",
  agencyPicksIngredients: {
    "metadata.description": [
      "topshot",          // Getty
      "topshots",         // Getty
      "bestpix",          // Getty
      "PABest",           // PA
      "PA Best",          // PA
      "TPX IMAGES OF THE DAY", // Reuters
      "epaselect",        // EPA
    ],
    "metadata.keywords": [
      "epaselect",        // EPA
      "aptopix",          // AP
      "APTOPIX",          // AP
      "SPOTLIGHT",        // Rex/Shutterstock
      "spotlight",        // Rex/Shutterstock
      "Spotlight",        // Rex/Shutterstock
      "EDITORS' PICKS",   // Rex/Shutterstock
      "PABest",           // PA
    ],
    "metadata.title": [
      "aptopix",          // AP
      "APTOPIX",          // AP
    ],
  } as Record<string, string[]>,

  /**
   * Ticker definitions — each entry drives a filter aggregation in _doSearch
   * and a badge in StatusBar + Filters panel.
   * Mirrors the aggregationsNameToSearchClauseMap built in ElasticSearch.scala.
   * Gated by the same feature flags as the underlying `is:` queries.
   */
  tickerDefinitions: [
    {
      name: "GNM-owned",
      searchClause: "is:GNM-owned",
      backgroundColour: "#005689",
    },
    // Agency picks gated by hasAgencyPicks (true in this mock config).
    // When dynamic config is wired, this entry should be conditional.
    {
      name: "agency picks",
      searchClause: "is:agency-pick",
      backgroundColour: "#7d006880",
      subAggField: "usageRights.supplier",
    },
  ] as TickerDefinition[],

  /** Field aliases from config — drives additional search fields + typeahead */
  fieldAliases: [
    {
      elasticsearchPath: "fileMetadata.iptc.Edit Status",
      alias: "editStatus",
      label: "Edit Status",
      displaySearchHint: false,
      displayInAdditionalMetadata: true,
      searchHintOptions: ["ORIGINAL", "NORMAL", "UPDATE", "CORRECTION", "DELETION"],
    },
    {
      elasticsearchPath: "fileMetadata.icc.Profile Description",
      alias: "colourProfile",
      label: "Colour Profile",
      displaySearchHint: false,
      displayInAdditionalMetadata: true,
    },
    {
      elasticsearchPath: "fileMetadata.colourModel",
      alias: "colourModel",
      label: "Colour Model",
      displaySearchHint: false,
      displayInAdditionalMetadata: true,
      searchHintOptions: ["RGB", "CMYK", "Greyscale", "LAB"],
    },
    {
      elasticsearchPath: "fileMetadata.colourModelInformation.hasAlpha",
      alias: "cutout",
      label: "Cutout",
      displaySearchHint: true,
      displayInAdditionalMetadata: true,
      searchHintOptions: ["false", "true"],
    },
    {
      elasticsearchPath: "fileMetadata.colourModelInformation.bitsPerSample",
      alias: "bitsPerSample",
      label: "Bits Per Sample",
      displaySearchHint: false,
      displayInAdditionalMetadata: true,
      searchHintOptions: ["8", "16", "32"],
    },
    {
      elasticsearchPath: "fileMetadata.xmp.Iptc4xmpExt:DigitalSourceType",
      alias: "digitalSourceType",
      label: "Digital Source Type",
      displaySearchHint: false,
      displayInAdditionalMetadata: true,
      searchHintOptions: [
        "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
        "http://cv.iptc.org/newscodes/digitalsourcetype/computationalCapture",
        "http://cv.iptc.org/newscodes/digitalsourcetype/negativeFilm",
        "http://cv.iptc.org/newscodes/digitalsourcetype/positiveFilm",
        "http://cv.iptc.org/newscodes/digitalsourcetype/print",
        "http://cv.iptc.org/newscodes/digitalsourcetype/humanEdits",
        "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia",
        "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicallyEnhanced",
        "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCreation",
        "http://cv.iptc.org/newscodes/digitalsourcetype/dataDrivenMedia",
        "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
        "http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicMedia",
        "http://cv.iptc.org/newscodes/digitalsourcetype/screenCapture",
        "http://cv.iptc.org/newscodes/digitalsourcetype/composite",
        "http://cv.iptc.org/newscodes/digitalsourcetype/compositeCapture",
        "http://cv.iptc.org/newscodes/digitalsourcetype/compositeSynthetic",
      ],
    },
    {
      elasticsearchPath: "fileMetadata.xmp.Iptc4xmpCore:Scene",
      alias: "sceneCode",
      label: "Scene Code",
      displaySearchHint: false,
      displayInAdditionalMetadata: true,
    },
  ] as FieldAlias[],
} as const;

/**
 * Runtime availability flag for Bedrock AI search.
 * Set to true by the health check in main.tsx on app startup.
 * Readable by any UI component that needs to gate AI search features.
 */
export let bedrockAvailable = false;

const _bedrockListeners = new Set<(v: boolean) => void>();

/** Subscribe to bedrockAvailable changes. Returns an unsubscribe function. */
export function subscribeBedrockAvailable(fn: (v: boolean) => void): () => void {
  _bedrockListeners.add(fn);
  return () => _bedrockListeners.delete(fn);
}

/** Called once at startup by main.tsx after the health probe resolves. */
export function setBedrockAvailable(value: boolean): void {
  bedrockAvailable = value;
  _bedrockListeners.forEach((fn) => fn(value));
}

