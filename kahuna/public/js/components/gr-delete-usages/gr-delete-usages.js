import angular from 'angular';

import template from './gr-delete-usages.html';
import './gr-delete-usages.css';

import {confirmDelete} from '../gr-confirm-delete/gr-confirm-delete';
import {imageUsagesService} from '../../services/image/usages';

export const deleteUsages = angular.module('gr.deleteUsages', [
  confirmDelete.name,
  imageUsagesService.name
]);

deleteUsages.controller('grDeleteUsagesCtrl', [
  '$window',
  'imageUsagesService',
  function($window, imageUsagesService) {
    const ctrl = this;

    ctrl.active = false;

    imageUsagesService.canDeleteUsages(ctrl.image).then(deleteUsages => {
      if (!deleteUsages) {
        ctrl.active = false;
        return;
      }

      ctrl.active = true;

      ctrl.delete = () => {
        const deleteConfirmText = 'DELETE';

        const superSure = $window.prompt(
          `You're about to delete the ALL USAGES for this image. 
          This will NOT remove the image from content, 
          however it will remove it from Grid's database.
          Type ${deleteConfirmText} below to confirm.`
        );

        if (superSure === deleteConfirmText) {
          deleteUsages().then(ctrl.onDelete);
        }
      };
    });
  }
]);

deleteUsages.directive('grDeleteUsages', [function () {
  return {
    restrict: 'E',
    controller: 'grDeleteUsagesCtrl',
    controllerAs: 'ctrl',
    bindToController: true,
    template: template,
    scope: {
      image: '=grImage',
      onDelete: '&grOnDelete'
    }
  };
}]);
