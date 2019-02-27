import angular from 'angular';

import template from './gr-delete-usages.html';
import './gr-delete-usages.css';

import {confirmDelete} from '../gr-confirm-delete/gr-confirm-delete';
import {imageUsagesService} from '../../services/image/usages';

import {string} from '../../util/string';

export const deleteUsages = angular.module('gr.deleteUsages', [
  confirmDelete.name,
  imageUsagesService.name,
  string.name
]);

deleteUsages.controller('grDeleteUsagesCtrl', [
  '$window',
  'imageUsagesService',
  'stripMargin',
  function($window, imageUsagesService, stripMargin) {
    const ctrl = this;

    ctrl.userHasPermission = false;

    imageUsagesService.canDeleteUsages(ctrl.image).then(deleteUsages => {
      if (!deleteUsages) {
        ctrl.userHasPermission = false;
        return;
      }

      ctrl.userHasPermission = true;

      ctrl.delete = () => {
        const deleteConfirmText = 'DELETE';

        const superSure = $window.prompt(
          stripMargin`
            |You're about to delete the ALL USAGES for this image.
            |This will NOT remove the image from content,
            |however it will remove it from Grid's database.
            |
            |Enter ${deleteConfirmText} below to confirm.
            |`
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
