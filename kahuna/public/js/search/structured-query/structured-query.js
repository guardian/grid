import angular from "angular";
import Rx from "rx";

import "./structured-query.css";

import { grChips } from "../../components/gr-chips/gr-chips";

import { rxUtil } from "../../util/rx";

import { querySuggestions, filterFields } from "./query-suggestions";
import { renderQuery, structureQuery } from "./syntax";
import { grCqlInput } from "../../components/gr-cql.input/gr-cql-input";

export const grStructuredQuery = angular.module("gr.structuredQuery", [
  rxUtil.name,
  grChips.name,
  querySuggestions.name,
  grCqlInput.name,
]);

grStructuredQuery.controller("grStructuredQueryCtrl", [
  "querySuggestions",
  "$scope",
  function (querySuggestions, $scope) {
    const ctrl = this;
    ctrl.$onInit = () => {
      ctrl.maybeOrgOwnedValue = window._clientConfig.maybeOrgOwnedValue;

      const structuredQueryUpdates$ = Rx.Observable.create((observer) => {
        ctrl.structuredQueryChanged = function (structuredQuery) {
          if (
            ctrl.maybeOrgOwnedValue &&
            structuredQuery.find(
              (item) => item.value === ctrl.maybeOrgOwnedValue,
            )
          ) {
            $scope.searchQuery.filter.orgOwned = true;
          } else {
            $scope.searchQuery.filter.orgOwned = false;
          }
          observer.onNext(structuredQuery);
        };
      });

      ctrl.newQuery$ = structuredQueryUpdates$
        .map(renderQuery)
        .map(valOrUndefined)
        .distinctUntilChanged()
        .debounce(500);

      ctrl.getSuggestions = querySuggestions.getChipSuggestions;

      ctrl.filterFields = filterFields;

      function valOrUndefined(str) {
        // Watch out for `false`, but we know it's a string here..
        return str ? str : undefined;
      }
    };
  },
]);

grStructuredQuery.directive("grStructuredQuery", [
  "subscribe$",
  function (subscribe$) {
    return {
      restrict: "E",
      require: ["grStructuredQuery", "ngModel"],
      template: `
            <gr-cql-input on-change="handleChange" initialValue="initialValue">
            </gr-cql-input>`,
      controller: "grStructuredQueryCtrl",
      controllerAs: "ctrl",
      link: function (scope, element, attrs, [ctrl, ngModelCtrl]) {
        scope.handleChange = (str) => {
          console.log({ str });
          ngModelCtrl.$setViewValue(str);
        };
        ngModelCtrl.$render = function () {
          console.log("render", ngModelCtrl.$viewValue);
          scope.initialValue = ngModelCtrl.$viewValue || "";
        };
      },
    };
  },
]);
