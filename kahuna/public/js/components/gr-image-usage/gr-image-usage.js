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
  '$state',
  'inject$',
  '$window',
  'imageUsagesService',

  function ($scope, $state, inject$, $window, imageUsagesService) {

    const ctrl = this;

    ctrl.$onInit = () => {
      ctrl.showSendToPhotoSales = $window._clientConfig.showSendToPhotoSales;

      const usages = imageUsagesService.getUsages(ctrl.image);
      const usages$ = usages.groupedByState$.map((u) => u.toJS());
      const usagesCount$ = usages.count$;

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
        // a bit nasty - but it updates the state of the page better than trying to do that in
        // the client.
        $state.go('image', {imageId: ctrl.image.data.id, crop: undefined}, {reload: true});
      };

      const hasSyndicationUsages$ =
        imageUsagesService.getUsages(ctrl.image).hasSyndicationUsages$;

      inject$($scope, usages$, ctrl, 'usages');
      inject$($scope, usagesCount$, ctrl, 'usagesCount');
      inject$($scope, hasSyndicationUsages$, ctrl, 'hasSyndicationUsages');
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

    ctrl.isRecent = (usage) => {
      const nowtime = new Date();
      let recent = moment(usage.dateAdded)
        .isAfter(moment(nowtime).subtract(imageUsagesService.recentTime, 'days'));
      let ignored = usage.platform === "print" && usage.status !== "published";
      return recent && !ignored;
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
