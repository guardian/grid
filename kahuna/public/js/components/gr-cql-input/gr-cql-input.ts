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
import { theme } from "./theme";

export const grCqlInput = angular.module("gr.cqlInput", [
  querySuggestions.name
]);

grCqlInput.directive<
  angular.IScope & {
    onChange:() => (str: string) => void;
    gridQueryToCqlQuery: (gridStr: string) => string;
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

              return suggestions.map(
                (suggestion): { label: undefined; value: string } => ({
                  label: undefined,
                  value: suggestion
                }),
              );
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
      theme,
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
      template: `<cql-input value="{{value}}" placeholder="Search for images… (type + for advanced search)" autofocus></cql-input>`,
      link: function (scope, element) {
        const cqlInput = element.find("cql-input")[0];

        if (!cqlInput) {
          throw new Error("Expected a `cql-input` element in the template");
        }

        // Ensure that we pass the relevant keyboard shortcuts on, while
        // preventing handled events from propagating.
        const keysToPropagate = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
        ["keydown", "keyup", "keypress"].forEach(eventType => {
          cqlInput.addEventListener(eventType, (e) => {
            const { shiftKey, altKey, metaKey, ctrlKey, key } =
              e as KeyboardEvent;

            const noModifier = !(shiftKey || altKey || metaKey || ctrlKey);
            if (
              e.defaultPrevented ||
              (noModifier && !keysToPropagate.includes(key))
            ) {
              e.stopImmediatePropagation();
            }
          });
        });

        cqlInput.addEventListener(
          "queryChange",
          (event: QueryChangeEventDetail) => {
            if (event.detail?.queryAst) {
              scope.onChange()(event.detail.queryStr);
            }
          },
        );
      }
    };
  }
]);
