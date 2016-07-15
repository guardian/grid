import angular from 'angular';

import template from './gr-image-cost-message.html!text';

export const module = angular.module('gr.imageCostMessage', []);

module.directive('grImageCostMessage', [function () {
    return {
        restrict: 'E',
        template: template,
        transclude: true,
        scope: {
            image: '=grImage'
        }
    };
}]);
