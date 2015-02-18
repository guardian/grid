import angular from 'angular';
import template from './top-bar.html!text';
import navTemplate from './top-bar-nav.html!text';
import actionsTemplate from './top-bar-actions.html!text';

export var topBar = angular.module('kahuna.common.topBar', []);

topBar.directive('gridTopBar', [function() {
    return {
        restrict: 'E',
        template: template,
        transclude: 'replace'
    };
}]);

topBar.directive('gridTopBarNav', [function() {
    return {
        restrict: 'E',
        template: navTemplate,
        transclude: true
    };
}]);

topBar.directive('gridTopBarActions', [function() {
    return {
        restrict: 'E',
        template: actionsTemplate,
        transclude: true
    };
}]);
