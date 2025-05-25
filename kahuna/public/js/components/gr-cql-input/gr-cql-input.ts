import * as angular from "angular";
import {
  createCqlInput,
  Typeahead,
  TypeaheadField,
  QueryChangeEventDetail,
  CqlQuery,
  CqlBinary,
  CqlExpr
} from "@guardian/cql";
import { querySuggestions } from "../../search/structured-query/query-suggestions";

export const grCqlInput = angular.module("gr.cqlInput", [querySuggestions.name]);

grCqlInput.directive<
  angular.IScope & { onChange:() => (str: string) => void }
>("grCqlInput", [
  "querySuggestions",
  function (cqlSuggestions) {
    const fields: TypeaheadField[] = cqlSuggestions.typeaheadFields.map(
      ({ fieldName, resolver }: any) => {
        const mappedResolver = resolver
          ? async (fieldName: string) => {
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

    const typeahead = new Typeahead(fields);

    const CqlInput = createCqlInput(typeahead, {
      theme: { baseFontSize: "14px", input: { layout: { padding: "2px" } } },
      lang: { operators: false, groups: false }
    });
    customElements.define("cql-input", CqlInput as any);

    return {
      restrict: "E",
      scope: {
        onChange: "&",
        initialValue: "="
      },
      template: "<cql-input></cql-input>",
      link: function (scope, element) {
        const cqlInput = element.find("cql-input")[0];
        cqlInput.addEventListener(
          "queryChange",
          (event: QueryChangeEventDetail) => {
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
      }
    };
  }
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
