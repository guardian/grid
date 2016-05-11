import angular from 'angular';
import 'titip';

export const tooltip = angular.module('grTooltip', []);

tooltip.directive('grTooltip', [
    'onValChange',
    '$interpolate',
    function (onValChange, $interpolate) {
        return {
            restrict: 'A',
            link: function ($scope, element, attrs) {
                const position = attrs.grTooltipPosition || 'bottom';
                const toolTipText = $interpolate(attrs.grTooltip);
                element.attr('data-title', toolTipText)
                    .addClass(`titip-default`)
                    .addClass(`titip-${position}`);

                const autoUpdates = angular.isDefined(attrs.grTooltipUpdates);

                if (autoUpdates) {
                    $scope.$watch(() => attrs.grTooltip, onValChange(newTooltip => {
                        element.attr('data-title', newTooltip);
                    }));
                }
            }
    };
}]);
