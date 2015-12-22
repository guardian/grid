import angular from 'angular';
import 'titip';

export const module = angular.module('grTooltip', []);

module.directive('grTooltip', ['onValChange', function (onValChange) {
    return {
        restrict: 'A',
        link: function ($scope, element, attrs) {
            const position = attrs.grTooltipPosition || 'bottom';

            element.attr('data-title', attrs.grTooltip)
                .addClass(`titip-default`)
                .addClass(`titip-${position}`);

            const autoUpdates = angular.isDefined(attrs.grTooltipUpdates) || false;

            if (autoUpdates) {
                $scope.$watch(() => attrs.grTooltip, onValChange(newTooltip => {
                    element.attr('data-title', newTooltip);
                }));
            }
        }
    };
}]);
