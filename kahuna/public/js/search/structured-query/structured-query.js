import angular from 'angular';
import Rx from 'rx';

import './structured-query.css';

import {grChips} from '../../components/gr-chips/gr-chips';

import {rxUtil} from '../../util/rx';

import {querySuggestions, filterFields} from './query-suggestions';
import {renderQuery, structureQuery} from './syntax';
import { getFeatureSwitchActive } from '../../components/gr-feature-switch-panel/gr-feature-switch-panel';

export const grStructuredQuery = angular.module('gr.structuredQuery', [
    rxUtil.name,
    grChips.name,
    querySuggestions.name
]);


grStructuredQuery.controller('grStructuredQueryCtrl',
                             ['querySuggestions', '$scope',
                              function(querySuggestions, $scope) {
    const ctrl = this;
    ctrl.$onInit = () => {

      ctrl.maybeOrgOwnedValue = window._clientConfig.maybeOrgOwnedValue;

      const structuredQueryUpdates$ = Rx.Observable.create(observer => {
          ctrl.structuredQueryChanged = function(structuredQuery) {
              if (ctrl.maybeOrgOwnedValue && structuredQuery.find(item => item.value === ctrl.maybeOrgOwnedValue)){
                  $scope.searchQuery.filter.orgOwned = true;
              } else {
                  $scope.searchQuery.filter.orgOwned = false;
              }
              observer.onNext(structuredQuery);
          };
      });

      ctrl.newQuery$ = structuredQueryUpdates$.
          map(renderQuery).
          map(valOrUndefined).
          distinctUntilChanged().
          debounce(500);

      ctrl.getSuggestions = querySuggestions.getChipSuggestions;

      ctrl.filterFields = filterFields;

      function valOrUndefined(str) {
          // Watch out for `false`, but we know it's a string here..
          return str ? str : undefined;
      }
    };
}]);

grStructuredQuery.directive("grStructuredQuery", [
  "subscribe$",
  function (subscribe$) {
    return {
      restrict: "E",
      require: ["grStructuredQuery", "ngModel"],
      template: `
            <gr-chips ng-if="!ctrl.useCql"
                      autofocus="autofocus"
                      ng-model="ctrl.structuredQuery"
                      gr:valid-keys="ctrl.filterFields"
                      gr:on-change="ctrl.structuredQueryChanged($chips)"
                      gr:autocomplete="ctrl.getSuggestions($chip)">
            </gr-chips>
            <gr-cql-input ng-if="ctrl.useCql"
                          on-change="handleChange"
                          initialValue="initialValue">
            </gr-cql-input>`,
      controller: "grStructuredQueryCtrl",
      controllerAs: "ctrl",
      link: function (scope, _element, _attrs, [ctrl, ngModelCtrl]) {
        scope.ctrl.useCql = getFeatureSwitchActive("use-cql-chips")
        if (scope.ctrl.useCql) {
          scope.handleChange = ngModelCtrl.$setViewValue;
          ngModelCtrl.$render = function () {
            scope.initialValue = ngModelCtrl.$viewValue || "";
          };
        } else {
          ngModelCtrl.$render = function () {
            const queryString = ngModelCtrl.$viewValue || "";
            ctrl.structuredQuery = structureQuery(queryString);
          };

          subscribe$(scope, ctrl.newQuery$, (query) => {
            ngModelCtrl.$setViewValue(query);
          });
        }
      },
    };
  },
]);
