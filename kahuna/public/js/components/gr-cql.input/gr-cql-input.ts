import * as angular from "angular";
import {
  createCqlInput,
  Typeahead,
  TypeaheadField,
  TextSuggestionOption,
} from "@guardian/cql";
import { List, Map } from "immutable";
import { mediaApi } from "../../services/api/media-api";

export const grCqlInput = angular.module("gr.cqlInput", []);

export const querySuggestions = angular.module("querySuggestions", [
  mediaApi.name,
]);

export type FieldAlias = {
  displaySearchHint: boolean;
  alias: string;
  searchHintOptions: any;
};

const fieldAliases = window._clientConfig.fieldAliases
  .filter((fieldAlias: FieldAlias) => fieldAlias.displaySearchHint === true)
  .reduce(
    function (map, fieldAlias) {
      map[fieldAlias.alias] = fieldAlias;
      return map;
    },
    {} as Record<string, FieldAlias>,
  );

// FIXME: get fields and subjects from API
const filterFields = [
  { value: "by", description: "Description to be added" },
  { value: "category", description: "Description to be added" },
  { value: "city", description: "The city in which the photo was taken" },
  { value: "copyright", description: "The copyright holder" },
  { value: "country", description: "The country in which the photo was taken" },
  { value: "credit", description: "Description to be added" },
  { value: "description", description: "Description to be added" },
  { value: "fileType", description: "Description to be added" },
  { value: "illustrator", description: "Description to be added" },
  { value: "in", description: "Description to be added" },
  { value: "keyword", description: "Contains a keyword, e.g. " },
  { value: "label", description: "Description to be added" },
  { value: "location", description: "Description to be added" },
  { value: "person", description: "Contains a person, e.g. " },
  { value: "source", description: "Description to be added" },
  { value: "specialInstructions", description: "Description to be added" },
  { value: "state", description: "The state in which the photo was taken" },
  { value: "subject", description: "The subject of the media" },
  { value: "supplier", description: "The supplier of the media" },
  { value: "suppliersReference", description: "The supplier reference of the media, e.g. " },
  { value: "title", description: "The media's title" },
  { value: "uploader", description: "The e-mail of the uploader" },
  { value: "usages@<added", description: "Description to be added" },
  { value: "usages@>added", description: "Description to be added" },
  { value: "usages@platform", description: "Description to be added" },
  { value: "usages@status", description: "Description to be added" },
  { value: "usages@reference", description: "Description to be added" },
  { value: "has", description: "Filters by the existence of a field, e.g. `has:crops`" },
  { value: "croppedBy", description: "The e-mail of the person that has cropped the media" },
  { value: "filename", description: "The filename of the uploaded original" },
  { value: "photoshoot", description: "The photoshoot that includes this photo" },
  { value: "leasedBy", description: "Description to be added" },
  { value: "is", description: "Description to be added" },
  ...Object.keys(fieldAliases).map((alias) => ({
    value: alias,
    description: undefined
  })),
].sort();

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

    function getFilterSuggestions(field: string, value: string) {
      switch (field) {
        case "usages@status":
          return ["published", "pending", "removed"];
        case "usages@platform":
          return listUsagePlatforms();
        case "subject":
          return prefixFilter(value)(subjects);
        case "fileType":
          return prefixFilter(value)(fileTypes);
        case "label":
          return suggestLabels(value);
        case "credit":
          return suggestCredit(value);
        case "source":
          return suggestSource(value);
        case "supplier":
          return listSuppliers().then(prefixFilter(value));
        // TODO: list all known bylines, not just our photographers
        case "by":
          return listPhotographers().then(prefixFilter(value));
        case "illustrator":
          return listIllustrators().then(prefixFilter(value));
        case "category":
          return listCategories().then(prefixFilter(value));
        case "photoshoot":
          return suggestPhotoshoot(value);
        case "is":
          return isSearch;
        // No suggestions
        default:
          return fieldAliases.hasOwnProperty(field)
            ? prefixFilter(value)(suggestFieldAliasOptions(field))
            : [];
      }
    }

    type Chip = {
      type: string;
      value: string;
      key: string;
    };

    function getChipSuggestions(chip: Chip) {
      if (chip.type === "filter-chooser") {
        return filterFields.filter((f) => f.value.startsWith(chip.value));
      } else if (chip.type === "filter") {
        return getFilterSuggestions(chip.key, chip.value);
      } else {
        return [];
      }
    }

    return {
      getChipSuggestions,
    };
  },
]);

export const fields: TypeaheadField[] = filterFields.map((fieldName) => {
  const resolver = async (str: string): Promise<TextSuggestionOption[]> => {
    const service: any = angular
      .element(document)
      .injector()
      .get("querySuggestions");

    const suggestions: string[] = await service.getChipSuggestions({
      type: "filter",
      value: str,
      key: fieldName,
    });

    console.log(suggestions);
    return suggestions.map((suggestion) => {
      console.log(suggestion);
      return { label: suggestion, value: suggestion };
    });
  };

  return new TypeaheadField(fieldName.value, fieldName.value, fieldName.description, resolver);
});

const typeahead = new Typeahead(fields);

const CqlInput = createCqlInput(typeahead, {
  theme: { baseFontSize: "14px", input: { layout: { padding: "2px" } } },
  lang: { operators: false, groups: false },
});
customElements.define("cql-input", CqlInput as any);

grCqlInput.directive("grCqlInput", [
  function () {
    return {
      restrict: "E",
      template: "<cql-input></cql-input>",
      controller: function () {
        console.log("controller");
      },
      link: function (scope, element, attrs) {
        console.log("link");
      },
    };
  },
]);
