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

export const gridConfig = {
  /**
   * The organisation name used for `is:<org>-owned` style queries.
   * From `staffPhotographerOrganisation` in Grid config (default "GNM").
   */
  staffPhotographerOrganisation: "GNM",


  /** Whether the reaper feature is enabled */
  useReaper: false,

  /** Whether agency pick filtering is available */
  hasAgencyPicks: true,

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

