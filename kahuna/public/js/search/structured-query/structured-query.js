import angular from 'angular';
import Rx from 'rx';

import './structured-query.css';

import {grChips} from '../../components/gr-chips/gr-chips';

import {rxUtil} from '../../util/rx';

import {querySuggestions, filterFields} from './query-suggestions';
import {renderQuery, structureQuery} from './syntax';
import { generateId, sendTelemetryEvent } from '../../services/telemetry';

export const grStructuredQuery = angular.module('gr.structuredQuery', [
    rxUtil.name,
    grChips.name,
    querySuggestions.name
]);


grStructuredQuery.controller('grStructuredQueryCtrl',
                             ['querySuggestions',
                              function(querySuggestions) {
    const ctrl = this;

    const structuredQueryUpdates$ = Rx.Observable.create(observer => {
        ctrl.structuredQueryChanged = function(structuredQuery) {
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
}]);


grStructuredQuery.directive('grStructuredQuery', ['subscribe$', function(subscribe$) {
    return {
        restrict: 'E',
        require: ['grStructuredQuery', 'ngModel'],
        template: `
<gr-chips autofocus="autofocus"
          ng-model="ctrl.structuredQuery"
          gr:valid-keys="ctrl.filterFields"
          gr:on-change="ctrl.structuredQueryChanged($chips)"
          gr:autocomplete="ctrl.getSuggestions($chip)">
</gr-chips>
`,
        controller: 'grStructuredQueryCtrl',
        controllerAs: 'ctrl',
        link: function(scope, element, attrs, [ctrl, ngModelCtrl]) {
            ngModelCtrl.$render = function() {
                const queryString = ngModelCtrl.$viewValue || '';
                ctrl.structuredQuery = structureQuery(queryString);
            };

            subscribe$(scope, ctrl.newQuery$, query => {
                ngModelCtrl.$setViewValue(query);
                const structuredQuery = structureQuery(query);
                const searchId = generateId();
                structuredQuery.forEach(queryComponent => {
                    // e.g. filter or search:
                    // search > {type: 'text', value: 'my search'}
                    // filter > {type: 'filter', filterType: 'inclusion', key: 'is', value: 'cool'}
                    const { type } = queryComponent;
                    const formattedType = (type) => {
                        if (type === 'text') { return 'GRID_SEARCH'; }
                        if (type === 'filter') { return 'GRID_FILTER'; }
                        return `GRID_${type.toUpperCase()}`;
                    };
                    if (queryComponent.value){
                        // In case search is empty, as with a search containing only filters
                        sendTelemetryEvent(formattedType(type), {...queryComponent, searchId: searchId}, 1);
                    };
                });
            });
        }
    };
}]);
