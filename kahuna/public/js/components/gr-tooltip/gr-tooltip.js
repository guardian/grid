import angular from 'angular';
import 'titip';

export const module = angular.module('grTooltip', []);

module.directive('grTooltip', [function () {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            const position = attrs.grTooltipPosition || 'bottom';

            element.attr('data-title', attrs.grTooltip)
                .addClass(`titip-default`)
                .addClass(`titip-${position}`);
        }
    };
}]);
