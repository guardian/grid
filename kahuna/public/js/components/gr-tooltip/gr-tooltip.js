import angular from 'angular';
import 'titip';

export const tooltip = angular.module('grTooltip', []);

tooltip.directive('grTooltip', ['$timeout', 'onValChange', function ($timeout, onValChange) {
    return {
        restrict: 'A',
        link: function ($scope, element, attrs) {
            const position = attrs.grTooltipPosition || 'bottom';

            element.attr('data-title', attrs.grTooltip);

            const autoUpdates = angular.isDefined(attrs.grTooltipUpdates);

            if (autoUpdates) {
                $scope.$watch(() => attrs.grTooltip, onValChange(newTooltip => {
                    element.attr('data-title', newTooltip);
                }));
            }

            element.bind('mouseenter', () => {
                element.addClass('titip-default')
                    .addClass(`titip-${position}`);

                $timeout(() => {
                    element.removeClass('titip-default')
                        .removeClass(`titip-${position}`);
                }, 1500);
            });
        }
    };
}]);
