import angular from 'angular';
import 'titip';

export const module = angular.module('grTitle', []);

module.directive('grTitle', [function () {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            const position = attrs.grTitlePosition || 'bottom';

            element.attr('data-title', attrs.grTitle)
                .addClass('titip-default')
                .addClass(`titip-${position}`);

            element.removeAttr('title');
        }
    };
}]);
