import angular from 'angular';
import moment from 'moment';

import '../../util/rx';

import template from './gr-image-usage.html';
import usageTemplate from './gr-image-usage-list.html';
import './gr-image-usage.css';

import '../../services/image/usages';
import {deleteUsages} from '../gr-delete-usages/gr-delete-usages';

import '../gr-image-usage-photosales/gr-image-usage-photosales';
import {sendToCaptureUsagePanelTxt} from "../../util/constants/sendToCapture-config";

export const module = angular.module('gr.imageUsage', [
  'gr.image-usages.service',
  'gr.imageUsagePhotoSales',
  'util.rx',
  deleteUsages.name
]);

module.controller('grImageUsageCtrl', [
  '$scope',
  '$rootScope',
  '$state',
  'inject$',
  '$window',
  'imageUsagesService',

  function ($scope, $rootScope, $state, inject$, $window, imageUsagesService) {

    const ctrl = this;

    const bindUsages = (image) => {
      const usages = imageUsagesService.getUsages(image);
      const usages$ = usages.groupedByState$
        .map((grouped) => grouped
          .map(list => list.sortBy(usage => usage.get('dateAdded')).reverse())
          .toJS()
        );
      inject$($scope, usages$, ctrl, 'usages');
      inject$($scope, usages.count$, ctrl, 'usagesCount');
      inject$($scope, usages.hasSyndicationUsages$, ctrl, 'hasSyndicationUsages');
    };

    ctrl.$onInit = () => {
      ctrl.showSendToPhotoSales = $window._clientConfig.showSendToPhotoSales;

      bindUsages(ctrl.image);

      // TODO match on `platform` rather than `type` as `platform` includes more detail
      ctrl.usageTypeToName = (usageType) => {
        switch (usageType) {
          case 'removed':
            return 'Taken down';
          case 'pending':
            return 'Pending publication';
          case 'published':
            return 'Published';
          case 'downloaded':
            return 'Downloads';
          case 'unknown':
            return 'Front'; // currently only fronts have an `unknown` type, see TODO above
          default:
            return usageType;
        }
      };

      ctrl.photoSalesUsages = () => {
        const processedUsages = [];
        ctrl.image.data.usages.data.forEach( (usage)  => {
          if (usage.data.platform === "syndication" && usage.data.syndicationUsageMetadata.partnerName === "Capture") {
            processedUsages.push({
              title: usage.data.syndicationUsageMetadata.syndicatedBy,
              usageName: sendToCaptureUsagePanelTxt,
              usageType: "sendToPhotoSales",
              dateAdded: usage.data.dateAdded
            });
          }
        });
        return processedUsages;
      };

      ctrl.onUsagesDeleted = () => {
        $state.go('image', {imageId: ctrl.image.data.id, crop: undefined}, {reload: true});
      };

      const freeImagesUpdateListener = $rootScope.$on('images-updated', (e, updatedImages) => {
        const maybeUpdatedImage = updatedImages.find(u => u.data.id === ctrl.image.data.id);
        if (maybeUpdatedImage) {
          ctrl.image = maybeUpdatedImage;
          bindUsages(ctrl.image);
        }
      });

      $scope.$on('$destroy', freeImagesUpdateListener);
    };
  }]);

module.directive('grImageUsage', [function() {
  return {
    restrict: 'E',
    template: template,
    controller: 'grImageUsageCtrl',
    controllerAs: 'ctrl',
    bindToController: true,
    scope: {
      image: '=grImage'
    }
  };
}]);

module.controller('grImageUsageListCtrl', [
  'imageUsagesService',
  function (imageUsagesService) {
    const ctrl = this;

    ctrl.formatTimestamp = (timestamp) => {
      return moment(timestamp).fromNow();
    };

    ctrl.isRecent = (timestamp) => {
      const nowtime = new Date();
      return moment(timestamp)
        .isAfter(moment(nowtime).subtract(imageUsagesService.recentTime, 'days'));
    };
  }]);


module.directive('grImageUsageList', [function () {
  return {
    restrict: 'E',
    template: usageTemplate,
    controller: 'grImageUsageListCtrl',
    controllerAs: 'ctrl',
    bindToController: true,
    scope: {
      type: '=',
      usages: '='
    }
  };
}]);
