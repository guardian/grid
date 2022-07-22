import angular from 'angular';
import 'titip/dist/css/titip.css';

export const tooltip = angular.module('grTooltip', []);

tooltip.directive('grTooltip', [
    'onValChange',
    function (onValChange) {
        return {
            restrict: 'A',
            link: function ($scope, element, attrs) {
                if (!attrs.grTooltip) {
                    return;
                }

                const position = attrs.grTooltipPosition || 'bottom';
                element.addClass(`titip-default`)
                    .addClass(`titip-${position}`);

                const tooltipContent = angular.element(`<span class="titip-content">${attrs.grTooltip}</span>`);
                element.append(tooltipContent);

                const autoUpdates = angular.isDefined(attrs.grTooltipUpdates);

                if (autoUpdates) {
                    $scope.$watch(() => attrs.grTooltip, onValChange(newTooltip => {
                        element.children('.titip-content').text(newTooltip);
                    }));
                }
            }
        };
    }]);
