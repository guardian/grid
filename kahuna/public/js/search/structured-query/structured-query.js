import angular from "angular";
import Rx from "rx";

import "./structured-query.css";

import { rxUtil } from "../../util/rx";

import { querySuggestions } from "./query-suggestions";
import { renderQuery } from "./syntax";
import { grCqlInput } from "../../components/gr-cql-input/gr-cql-input";
import { structureCqlQuery } from "../../components/gr-cql-input/syntax";

export const grStructuredQuery = angular.module("gr.structuredQuery", [
  rxUtil.name,
  querySuggestions.name,
  grCqlInput.name
]);

grStructuredQuery.controller("grStructuredQueryCtrl", [
  "$scope",
  function ($scope) {
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

      function valOrUndefined(str) {
        // Watch out for `false`, but we know it's a string here..
        return str ? str : undefined;
      }
    };
  }
]);

grStructuredQuery.directive("grStructuredQuery", [
  "subscribe$",
  function (subscribe$) {
    return {
      restrict: "E",
      require: ["grStructuredQuery", "ngModel"],
      template: `
            <gr-cql-input on-change="ctrl.handleChange"
                          value="ctrl.value">
            </gr-cql-input>`,
      controller: "grStructuredQueryCtrl",
      controllerAs: "ctrl",
      link: function (scope, _element, _attrs, [ctrl, ngModelCtrl]) {
        subscribe$(scope, ctrl.newQuery$, (query) => {
          ngModelCtrl.$setViewValue(query);
        });

        ctrl.handleChange = ({ queryStr, queryAst }) => {
          ctrl.value = queryStr;
          const structuredQuery = structureCqlQuery(queryAst);
          ctrl.structuredQueryChanged(structuredQuery);
        };

        ngModelCtrl.$render = function () {
          ctrl.value = ngModelCtrl.$viewValue || "";
        };
      }
    };
  }
]);
