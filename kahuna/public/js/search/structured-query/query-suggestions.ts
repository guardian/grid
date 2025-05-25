import * as angular from "angular";
import { List, Map } from "immutable";

import { mediaApi } from "../../services/api/media-api";

export const querySuggestions = angular.module("querySuggestions", [mediaApi.name]);

export type FieldAlias = {
  displaySearchHint: boolean;
  alias: string;
  searchHintOptions: any;
};

export type Chip = {
  filterType: "inclusion" | "exclusion";
  type: "filter-chooser" | "filter";
  key: string | undefined;
  value: string;
};

const subjects = [
  "arts",
  "crime",
  "disaster",
  "finance",
  "education",
  "environment",
  "health",
  "human",
  "labour",
  "lifestyle",
  "nature",
  "news",
  "politics",
  "religion",
  "science",
  "social",
  "sport",
  "war",
  "weather",
];

const fileTypes = ["jpeg", "tiff", "png"];

const staffPhotographerOrganisation =
  window._clientConfig.staffPhotographerOrganisation;

const isSearch = [
  `${staffPhotographerOrganisation}-owned-photo`,
  `${staffPhotographerOrganisation}-owned-illustration`,
  `${staffPhotographerOrganisation}-owned`,
  "under-quota",
  "deleted",
];

if (window._clientConfig.useReaper === true) {
  isSearch.push("reapable");
}

querySuggestions.factory("querySuggestions", [
  "mediaApi",
  "editsApi",
  function (mediaApi: any, editsApi: any) {
    const fieldAliases = window._clientConfig.fieldAliases
      .filter((fieldAlias: FieldAlias) => fieldAlias.displaySearchHint === true)
      .reduce(
        function (map, fieldAlias) {
          map[fieldAlias.alias] = fieldAlias;
          return map;
        },
        {} as Record<string, FieldAlias>,
      );

    const typeaheadFields = [
      {
        fieldName: "by",
        resolver: (value: string) =>
          listPhotographers().then(prefixFilter(value)),
      },
      {
        fieldName: "category",
        resolver: (value: string) => listCategories().then(prefixFilter(value)),
      },
      { fieldName: "city" },
      { fieldName: "copyright" },
      { fieldName: "country" },
      {
        fieldName: "credit",
        resolver: (value: string) => suggestCredit(value),
      },
      { fieldName: "description" },
      {
        fieldName: "fileType",
        resolver: (value: string) => prefixFilter(value)(fileTypes),
      },
      {
        fieldName: "illustrator",
        resolver: (value: string) =>
          listIllustrators().then(prefixFilter(value)),
      },
      { fieldName: "in" },
      { fieldName: "keyword" },
      {
        fieldName: "label",
        resolver: (value: string) => suggestLabels(value),
      },
      { fieldName: "location" },
      { fieldName: "person" },
      {
        fieldName: "source",
        resolver: (value: string) => suggestSource(value),
      },
      { fieldName: "specialInstructions" },
      { fieldName: "state" },
      {
        fieldName: "subject",
        resolver: (value: string) => prefixFilter(value)(subjects),
      },
      {
        fieldName: "supplier",
        resolver: (value: string) => listSuppliers().then(prefixFilter(value)),
      },
      { fieldName: "suppliersReference" },
      { fieldName: "title" },
      { fieldName: "uploader" },
      { fieldName: "usages@<added" },
      { fieldName: "usages@>added" },
      { fieldName: "usages@platform", resolver: listUsagePlatforms },
      {
        fieldName: "usages@status",
        resolver: ["published", "pending", "removed"],
      },
      { fieldName: "usages@reference" },
      { fieldName: "has" },
      { fieldName: "croppedBy" },
      { fieldName: "filename" },
      {
        fieldName: "photoshoot",
        resolver: (value: string) => suggestPhotoshoot(value),
      },
      { fieldName: "leasedBy" },
      { fieldName: "is", resolver: isSearch },
      ...Object.keys(fieldAliases).map((fieldName) => ({
        fieldName,
        resolver: fieldAliases.hasOwnProperty(fieldName)
          ? (value: string) =>
              prefixFilter(value)(suggestFieldAliasOptions(fieldName))
          : undefined,
      })),
    ].sort();

    const fieldNames = typeaheadFields.map((field) => field.fieldName);

    function prefixFilter(prefix: string) {
      const lowerPrefix = prefix.toLowerCase();
      return (values: string[]) =>
        values.filter((val) => val.toLowerCase().startsWith(lowerPrefix));
    }

    function listSuppliers() {
      return editsApi
        .getUsageRightsCategories()
        .then(
          (results: {
            value: string;
            properties: { name: string; options: any }[];
          }) => {
            return List<typeof results>(results)
              .filter((res: any) => res.value === "agency")
              .flatMap((res: any) => res.properties)
              .filter(
                (prop: { name: string; options: string }) =>
                  prop.name === "supplier",
              )
              .flatMap((prop: { options: any }) => prop.options)
              .toJS();
          },
        );
    }

    function listCategories() {
      // TODO: would be nice to use user friendly labels and map
      // them to the key internally
      return editsApi.getUsageRightsCategories().then((results: any) => {
        return results
          .map((res: any) => res.value)
          .filter((key: string) => key !== ""); // no empty category
      });
    }

    const photographerCategories = List.of(
      "staff-photographer",
      "contract-photographer",
    );
    function listPhotographers() {
      return editsApi.getUsageRightsCategories().then((results: any) => {
        return List(results)
          .filter((res: any) => photographerCategories.includes(res.value))
          .flatMap((res: any) => res.properties)
          .filter((prop: { name: string }) => prop.name === "photographer")
          .flatMap((prop: { optionsMap: any }) =>
            Map(prop.optionsMap).valueSeq(),
          )
          .flatMap((list) => list)
          .sort()
          .toJS();
      });
    }

    function listIllustrators() {
      return editsApi.getUsageRightsCategories().then((results: any) => {
        return List(results)
          .filter((res: any) => res.value === "contract-illustrator")
          .flatMap((res: any) => res.properties)
          .filter((prop: { name: string }) => prop.name === "creator")
          .flatMap((prop: { options: any }) => prop.options)
          .toJS();
      });
    }

    function suggestCredit(prefix: string) {
      return mediaApi
        .metadataSearch("credit", { q: prefix })
        .then((results: any) => results.data.map((res: any) => res.key));
    }

    function suggestSource(prefix: string) {
      return mediaApi
        .metadataSearch("source", { q: prefix })
        .then((results: any) => results.data.map((res: any) => res.key));
    }

    function suggestLabels(prefix: string) {
      return mediaApi
        .labelsSuggest({ q: prefix })
        .then((labels: any) => labels.data);
    }

    function suggestPhotoshoot(prefix: string) {
      return mediaApi
        .metadataSearch("photoshoot", { q: prefix })
        .then((results: any) => results.data.map((res: any) => res.key));
    }

    function listUsagePlatforms() {
      const suggestions = ["print", "digital"];
      if (window._clientConfig.recordDownloadAsUsage === true) {
        suggestions.push("download");
      }
      if (window._clientConfig.showSendToPhotoSales) {
        suggestions.push("Added to Photo Sales");
      }

      return suggestions;
    }

    function suggestFieldAliasOptions(fieldAlias: string) {
      return fieldAliases[fieldAlias].searchHintOptions;
    }

    function getChipSuggestions(chip: Chip) {
      if (chip.type === "filter-chooser") {
        return fieldNames.filter((f) => f.startsWith(chip.value));
      } else if (chip.type === "filter") {
        const field = typeaheadFields.find(field => field.fieldName === chip.key);
        if (!field?.resolver) {
          return [];
        }

        if (Array.isArray(field.resolver)) {
          return field.resolver;
        }

        return field.resolver(chip.value);
      } else {
        return [];
      }
    }

    return {
      typeaheadFields,
      getChipSuggestions,
    };
  },
]);
