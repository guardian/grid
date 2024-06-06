import angular from 'angular';
import {imageService} from '../../image/service';

import template from './gr-image-cost-message.html';
import './gr-image-cost-message.css';

export const module = angular.module('gr.imageCostMessage', [imageService.name]);

module.controller('grImageCostMessage', [
  'imageService',

  function (imageService) {
    let ctrl = this;

    ctrl.$onInit = () => {
      const states = imageService(ctrl.image).states;
      ctrl.messageState = (states.hasRestrictions) ? "conditional" : states.costState;

      ctrl.restrictionsText = () => {
        let rtxt = "";
        if (!this.image.data.usageRights) {
          return rtxt;
        }
        if (this.image.data.usageRights.usageRestrictions) {
          rtxt = this.image.data.usageRights.usageRestrictions;
        }
        rtxt = rtxt.trim();
        if (rtxt.length > 0 && rtxt[rtxt.length - 1] != ".") {
          rtxt = rtxt + ". ";
        } else {
          rtxt = rtxt + " ";
        }
        if (this.image.data.usageRights.restrictions) {
          rtxt = rtxt + this.image.data.usageRights.restrictions;
        }
        return rtxt;
      };

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
