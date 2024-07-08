import angular from 'angular';
import {imageService} from '../../image/service';
import {restrictionsText} from '../../util/rights-categories';

import template from './gr-image-cost-message.html';
import './gr-image-cost-message.css';

export const module = angular.module('gr.imageCostMessage', [imageService.name]);

module.controller('grImageCostMessage', [
  '$rootScope', 'imageService',

  function ($rootScope, imageService) {
    let ctrl = this;

    ctrl.$onInit = () => {
      function updateState() {
        ctrl.image.get().then(image => {
              const states = imageService(image).states;
              ctrl.messageState = (states.hasRestrictions) ? "conditional" : states.costState;
              ctrl.restrictionsText = () => {
                return restrictionsText(image);
              };
        });
      };

      $rootScope.$on('images-updated', () => {
          updateState();
      });

      updateState();

    };

  }
]);

module.directive('grImageCostMessage', [function () {
    return {
        restrict: 'E',
        template: template,
        transclude: true,
        scope: {
            image: '=grImage'
        },
        controller: 'grImageCostMessage',
        controllerAs: 'ctrl',
        bindToController: true
    };
}]);
