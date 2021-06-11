import angular from 'angular';

import template from './syntax.html';
import {grChipExample} from '../../directives/gr-chip-example';

import strings from '../../strings.json';

export const syntax = angular.module('grSyntax', [grChipExample.name]);

syntax.directive('grSyntax', [function () {
    return {
        restrict: 'E',
        template: template,
        transclude: 'replace',
        link: function($scope) {
            $scope.exampleEmail = strings.exampleEmail;
            $scope.advancedSearchExampleExplanation = strings.advancedSearchExampleExplanation;
        }
    };
}]);
