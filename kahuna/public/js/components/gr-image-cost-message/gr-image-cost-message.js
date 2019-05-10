import angular from 'angular';

import template from './gr-image-cost-message.html';
import './gr-image-cost-message.css';

export const module = angular.module('gr.imageCostMessage', []);

module.directive('grImageCostMessage', ['imageService', function (imageService) {
    return {
        restrict: 'E',
        template: template,
        transclude: true,
        link: scope => {
            const { states } = imageService(scope.image);
            scope.messageState = states.costState;
        },
        scope: {
            image: '=grImage'
        }
    };
}]);
