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
                element.addClass('titip-default').addClass(`titip-${position}`);

              // Remove any previous .titip-content
              element.find('.titip-content').remove();

              if (attrs.grTooltipHtml !== undefined) {
                // Use .titip-content for HTML tooltips
                const content = attrs.grTooltip || '';
                const contentSpan = angular.element('<span class="titip-content"></span>');
                contentSpan.html(content);
                element.append(contentSpan);
              } else {
                // Use data-title for plain text tooltips
                element.attr('data-title', attrs.grTooltip);
              }

                 const autoUpdates = angular.isDefined(attrs.grTooltipUpdates);

                if (autoUpdates) {
                  $scope.$watch(() => attrs.grTooltip, onValChange(newTooltip => {
                    if (attrs.grTooltipHtml !== undefined) {
                      element.find('.titip-content').html(newTooltip);
                    } else {
                      element.attr('data-title', newTooltip);
                    }
                  }));
                }
          }
    };
}]);
