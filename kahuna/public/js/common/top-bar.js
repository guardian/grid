import angular from 'angular';
import './top-bar.css!';

export var topBar = angular.module('kahuna.common.topBar', []);

topBar.directive('gridTopBar', [function() {
    return {
        restrict: 'E',
        transclude: 'replace',
        template: `<div ng:transclude class="top-bar-inner"></div>`

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
