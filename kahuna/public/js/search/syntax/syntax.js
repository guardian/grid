import angular from 'angular';

import template from './syntax.html!text';

export const syntax = angular.module('grSyntax', []);

syntax.directive('grSyntax', [function () {
    return {
        restrict: 'E',
        template: template,
        transclude: 'replace'
    };
}]);
