import angular from 'angular';
import 'titip/dist/css/titip.css';

export const tooltip = angular.module('grTooltip', []);

tooltip.directive('grTooltip', [
  'onValChange',
  function (onValChange) {
    return {
      restrict: 'A',
      link: function ($scope, element, attrs) {

        const position = attrs.grTooltipPosition || 'bottom';
        if (attrs.grTooltip) {
          element.attr('data-title', attrs.grTooltip)
            .addClass(`titip-default`)
            .addClass(`titip-${position}`);
        }

        const autoUpdates = angular.isDefined(attrs.grTooltipUpdates);

        if (autoUpdates) {
          $scope.$watch(() => attrs.grTooltip, onValChange(newTooltip => {
            const hasTooltip = angular.isDefined(element.attr('data-title'));
            const shouldHaveTooltip = angular.isDefined(newTooltip) && newTooltip !== '';

            if (shouldHaveTooltip) {
              element.attr('data-title', newTooltip);
            } else if (hasTooltip) {
              element.removeAttr('data-title');
            }

            if (!hasTooltip && shouldHaveTooltip) {
              element.addClass('titip-default')
                .addClass(`titip-${position}`);
            } else if (hasTooltip && !shouldHaveTooltip) {
              element.removeClass('titip-default')
                .removeClass(`titip-${position}`);
            }
          }));
        }
      }
    };
  }]);
