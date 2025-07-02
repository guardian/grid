import * as angular from "angular";
import {
  createCqlInput,
  Typeahead,
  TypeaheadField,
  QueryChangeEventDetail
} from "@guardian/cql";
import {
  querySuggestions,
  QuerySuggestionsService
} from "../../search/structured-query/query-suggestions";
import { cqlQueryToGridQuery, gridQueryToCqlQuery } from "./query-translation";

export const grCqlInput = angular.module("gr.cqlInput", [
  querySuggestions.name
]);

grCqlInput.directive<
  angular.IScope & {
    onChange:() => (str: string) => void;
    fromGridQuery: (gridStr: string) => string;
  }
>("grCqlInput", [
  "querySuggestions",
  function (querySuggestions: QuerySuggestionsService) {
    const fields: TypeaheadField[] = querySuggestions.typeaheadFields.map(
      ({ fieldName, resolver, type = "TEXT" }) => {
        const mappedResolver = resolver
          ? async (fieldName: string) => {
              const suggestions = await (Array.isArray(resolver)
                ? resolver
                : resolver(fieldName));

              return suggestions.map((suggestion) => ({
                label: undefined,
                value: suggestion
              }));
            }
          : undefined;

        return new TypeaheadField(
          fieldName,
          fieldName,
          undefined,
          mappedResolver,
          type,
        );
      },
    );

    const typeahead = new Typeahead(fields);

    const CqlInput = createCqlInput(typeahead, {
      theme: {
        baseFontSize: "14px",
        input: { layout: { padding: "2px" } },
        chipWrapper: {
          color: { background: "#333" }
        },
        chipContent: {
          layout: { padding: "2px" }
        },
        chipHandle: {
          color: {
            background: "none",
            border: "#444"
          }
        },
        typeahead: {
          layout: {
            minWidth: "200px",
            borderRadius: "none",
            padding: "5px"
          },
          color: {
            background: "#444"
          },
          option: {
            layout: {
              padding: "5px"
            }
          },
          selectedOption: {
            color: {
              background: "#00adee",
              text: "#fff"
            }
          }
        }
      },
      lang: { operators: false, groups: false }
    });

    customElements.define(
      "cql-input",
      CqlInput as unknown as CustomElementConstructor,
    );

    return {
      restrict: "E",
      scope: {
        onChange: "&",
        value: "="
      },
      template: `<cql-input value="{{fromGridQuery(value)}}" placeholder="Search for images… (type + for advanced search)"></cql-input>`,
      link: function (scope, element) {
        const cqlInput = element.find("cql-input")[0];
        scope.fromGridQuery = gridQueryToCqlQuery;

        cqlInput.addEventListener(
          "queryChange",
          (event: QueryChangeEventDetail) => {
            if (event.detail?.queryAst) {
              const toGrid = cqlQueryToGridQuery(event.detail?.queryAst);
              scope.onChange()(toGrid);
            }
          },
        );
      }
    };
  }
]);
