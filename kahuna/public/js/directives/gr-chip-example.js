import angular from 'angular';

export const grChipExample = angular.module('gr.chipExample', []);


grChipExample.directive('grChipExample', [function(){
    return {
        restrict: 'E',
        template: `<span class="gr-filter-chip">
        <span class="gr-filter-chip__type">{{grExclude}}</span>
        <span class="gr-filter-chip__key">{{grFilterField}}:&nbsp</span>
        <span>{{grExampleSearch}}&nbsp</span>
        <span class="gr-filter-chip__remove">✕</span>
        </span>`,
        scope: {
            grFilterField: '@',
            grExampleSearch: '@'
        },
        link: function(scope, element, attr) {
                scope.grExclude = angular.isDefined(attr.grExclude) ? '-' : '+';
        }

    };
}]);
