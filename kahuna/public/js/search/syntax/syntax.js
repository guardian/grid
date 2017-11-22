import angular from 'angular';

import template from './syntax.html';
import {grChipExample} from '../../directives/gr-chip-example';

export const syntax = angular.module('grSyntax', [grChipExample.name]);

syntax.directive('grSyntax', [function () {
    return {
        restrict: 'E',
        template: template,
        transclude: 'replace'
    };
}]);
