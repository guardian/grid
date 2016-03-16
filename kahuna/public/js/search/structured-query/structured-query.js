import angular from 'angular';
import Rx from 'rx';

import './structured-query.css!';

import {grChips} from '../../components/gr-chips/gr-chips';

import {rxUtil} from '../../util/rx';

import {querySuggestions, filterFields} from './query-suggestions';
import {renderQuery, structureQuery} from './syntax';
import '../../analytics/track';


export const grStructuredQuery = angular.module('gr.structuredQuery', [
    rxUtil.name,
    grChips.name,
    querySuggestions.name,
    'analytics.track'
]);


grStructuredQuery.controller('grStructuredQueryCtrl',
                             ['querySuggestions',
                              'track',
                              function(querySuggestions, track) {
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

    ctrl.track = track;


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
<gr-chips placeholder="Search for images…"
          autofocus="autofocus"
          ng:model="ctrl.structuredQuery"
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

                if (query && query !== '') {
                    const structured = structureQuery(query).filter(
                        (condition) => (
                            condition.key !== null &&
                            condition.value !== null &&
                            condition.type !== 'text')
                    );

                    const keys       = structured.map((condition) => condition.key);
                    const values     = structured.map((condition) => condition.value);
                    const eventData  = {
                        query: query,
                        structured: structured
                    };

                    if ((keys.length > 0) && (values.length > 0) ) {
                        eventData.keys = keys;
                        eventData.values = values;
                    }
                    ctrl.track.action('New Query', eventData);
                }
            });

        }
    };
}]);
