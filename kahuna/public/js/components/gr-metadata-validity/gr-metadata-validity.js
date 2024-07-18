import angular from 'angular';

import template from './gr-metadata-validity.html';
import './gr-metadata-validity.css';

export const module = angular.module('gr.metadataValidity', []);

module.controller('grMetadataValidityCtrl', [ '$rootScope', '$window', function ($rootScope, $window) {
    let ctrl = this;

    ctrl.$onInit = () => {
      function updateState() {
        ctrl.image.get().then(image => {
            let showDenySyndicationWarning = $window._clientConfig.showDenySyndicationWarning;
            ctrl.showDenySyndication = image.data.leases.data.leases.some(lease => (lease.access === 'deny-syndication' && lease.active != false)) && showDenySyndicationWarning;
            ctrl.isDeleted = image.data.softDeletedMetadata !== undefined;
            const hasUsageRights = Object.keys(image.data.usageRights).length > 0;
            if (!hasUsageRights) {
              ctrl.warningTextHeader = $window._clientConfig.warningTextHeaderNoRights;
              ctrl.showInvalidReasons = Object.keys(image.data.invalidReasons).length !== 0 || ctrl.isDeleted;
            } else {
              ctrl.warningTextHeader = $window._clientConfig.warningTextHeader;
              ctrl.showInvalidReasons = Object.keys(image.data.invalidReasons).length !== 0 || ctrl.isDeleted || image.data.usageRights.usageRestrictions;
            }
            ctrl.invalidReasons = image.data.invalidReasons;
            ctrl.isOverridden = ctrl.showInvalidReasons && image.data.valid;
            ctrl.isStrongWarning = ctrl.isDeleted || !ctrl.isOverridden || image.data.cost === "pay";

            ctrl.unusableTextHeader = $window._clientConfig.unusableTextHeader;
            ctrl.denySyndicationTextHeader = $window._clientConfig.denySyndicationTextHeader;
        });
      }

      $rootScope.$on('leases-updated', () => {
          updateState();
      });

      $rootScope.$on('images-updated', () => {
          updateState();
      });

      updateState();
    };
}]);

module.directive('grMetadataValidity', [function () {

    return {
        restrict: 'E',
        controller: 'grMetadataValidityCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        transclude: true,
        template: template,
        scope: {
            image: '=grImage'
        }
    };
}]);
