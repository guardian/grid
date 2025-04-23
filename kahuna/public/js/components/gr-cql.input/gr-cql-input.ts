import * as angular from "angular";
import {
  createCqlInput,
  Typeahead,
  TypeaheadField,
  TextSuggestionOption,
  QueryChangeEventDetail,
  CqlQuery,
  CqlBinary,
  CqlExpr,
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

    const filterFields = [
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

    return {
      filterFields,
    };
  },
]);

grCqlInput.directive<
  angular.IScope & { onChange: () => (str: string) => void }
>("grCqlInput", [
  "querySuggestions",
  function (querySuggestions) {
    const fields: TypeaheadField[] = querySuggestions.filterFields.map(
      ({ fieldName, resolver }: any) => {
        const mappedResolver = resolver
          ? async (fieldName: string) => {
              console.log({ fieldName, a, b });
              const suggestions = await resolver(fieldName);
              return suggestions.map((suggestion: any) => {
                return { label: suggestion, value: suggestion };
              });
            }
          : undefined;

        return new TypeaheadField(
          fieldName,
          fieldName,
          undefined,
          mappedResolver,
        );
      },
    );

    console.log({ querySuggestions });

    const typeahead = new Typeahead(fields);

    const CqlInput = createCqlInput(typeahead, {
      theme: { baseFontSize: "14px", input: { layout: { padding: "2px" } } },
      lang: { operators: false, groups: false },
    });
    customElements.define("cql-input", CqlInput as any);

    return {
      restrict: "E",
      scope: {
        onChange: "&",
        initialValue: "=",
      },
      template: "<cql-input></cql-input>",
      link: function (scope, element, attrs, ngModelCtrl) {
        const cqlInput = element.find("cql-input")[0];
        cqlInput.addEventListener(
          "queryChange",
          (event: QueryChangeEventDetail) => {
            console.log("queryChange", event);
            if (event.detail?.queryAst) {
              console.log(
                "update",
                event.detail?.queryStr,
                gridQueryStrFromQuery(event.detail?.queryAst),
              );
              scope.onChange()(gridQueryStrFromQuery(event.detail?.queryAst));
            }
          },
        );
        // ngModelCtrl.$render = function () {
        //   const queryString = ngModelCtrl.$viewValue || "";
        //   ctrl.structuredQuery = structureQuery(queryString);
        // };

        // subscribe$(scope, ctrl.newQuery$, (query) => {
        //   ngModelCtrl.$setViewValue(query);
        // });
      },
    };
  },
]);

const dateFields = ["from-date", "to-date"];
const relativeDateRegex = /(?<polarity>[-+])(?<quantity>\d+)(?<unit>[dmyw])/;

const add = (a: number, b: number) => a + b;
const substract = (a: number, b: number) => a - b;

const parseDateValue = (value: string): string => {
  const result = relativeDateRegex.exec(value);
  if (!result) {
    return value;
  }
  const now = new Date();
  const { polarity, quantity, unit } = result.groups as {
    polarity: string;
    quantity: string;
    unit: string;
  };

  const op = polarity === "+" ? add : substract;

  const year = op(now.getFullYear(), unit === "y" ? parseInt(quantity) : 0);
  // Months are zero indexed in Javascript, ha ha ha
  const month = op(now.getMonth(), unit === "m" ? parseInt(quantity) : 0);
  const day = op(
    now.getDate(),
    unit === "d"
      ? parseInt(quantity)
      : unit === "w"
        ? parseInt(quantity) * 7
        : 0,
  );
  const date = new Date(year, month, day);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
};

export const gridQueryStrFromQuery = (query: CqlQuery): string => {
  const { content } = query;
  if (!content) {
    return "";
  }
  return strFromBinary(content);
};

const strFromBinary = (binary: CqlBinary): string => {
  return (
    strFromExpr(binary.left) +
    (binary.right
      ? // Ignore the operator, which can only be OR
        ` ${strFromBinary(binary.right.binary)}`
      : "")
  );
};

const strFromExpr = (expr: CqlExpr) => {
  switch (expr.content.type) {
    case "CqlBinary":
      return strFromBinary(expr.content);
    case "CqlStr":
      return expr.content.searchExpr;
    case "CqlGroup":
      return `(${strFromBinary(expr.content.content)})`;
    case "CqlField":
      return `${expr.content.key.literal}:${expr.content.value?.literal ?? ""}`;
  }
};
