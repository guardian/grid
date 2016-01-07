import angular from 'angular';

import template from './syntax.html!text';

export const module = angular.module('grSyntax', []);

module.directive('grSyntax', [function () {
    return {
        restrict: 'E',
        template: template,
        transclude: 'replace'
    };
}]);
