import angular from 'angular';
import './top-bar.css!';

export var topBar = angular.module('kahuna.common.topBar', []);

topBar.directive('gridTopBar', [function() {
    return {
        restrict: 'E',
        transclude: 'replace',
        scope: {
            fixed: '='
        },
        template: `<ng:transclude class="grid-top-bar-inner"
                                  ng:class="{'grid-top-bar-inner--fixed': fixed}">
                   </ng:transclude>`
    };
}]);

topBar.directive('gridTopBarNav', [function() {
    return {
        restrict: 'E',
        transclude: true,
        template: `<ng:transclude></ng:transclude>`
    };
}]);

topBar.directive('gridTopBarActions', [function() {
    return {
        restrict: 'E',
        transclude: true,
        // Always have user actions at the end of actions
        template: `<ng:transclude></ng:transclude>
                   <ui-user-actions></ui-user-actions>`
    };
}]);
