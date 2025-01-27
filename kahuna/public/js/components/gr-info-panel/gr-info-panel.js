import angular from 'angular';
import Rx from 'rx';
import 'angular-ui-bootstrap';

import './gr-info-panel.css';
import '../../services/archive';
import '../../services/image-accessor';
import '../../services/image-list';
import '../../services/label';
import '../../services/panel';
import '../../edits/service';
import '../../forms/gr-xeditable/gr-xeditable';
import '../../util/rx';
import {radioList} from '../gr-radio-list/gr-radio-list';

export const grInfoPanel = angular.module('grInfoPanel', [
  'kahuna.services.image-accessor',
  'kahuna.services.image-list',
  'kahuna.services.label',
  'kahuna.services.panel',
  'kahuna.edits.service',
  'grXeditable',
  'ui.bootstrap',
  'util.rx',
  radioList.name
]);

grInfoPanel.controller('GrInfoPanelCtrl', [
  '$scope',
  '$q',
  'inject$',
  'imageList',
  'selectedImagesList$',
  'editsService',
  function (
    $scope,
    $q,
    inject$,
    imageList,
    selectedImagesList$,
    editsService) {

    const ctrl = this;
    ctrl.$onInit = () => {
      ctrl.showUsageRights = false;

      inject$($scope, selectedImagesList$, ctrl, 'selectedImages');

      const selectedCosts$ = selectedImagesList$.
        map(imageList.getCostState).
        map(imageList.getOccurrences);
      inject$($scope, selectedCosts$, ctrl, 'selectedCosts');

      const selectionIsEditable$ = selectedImagesList$.
        map(list => list.map(editsService.canUserEdit).toArray()).
        map($q.all).
        flatMap(Rx.Observable.fromPromise).
        map(allEditable => allEditable.every(v => v === true));
      inject$($scope, selectionIsEditable$, ctrl, 'userCanEdit');

      ctrl.stylePercentageLeased = (cost, alt) => {
        const imageIsOfThisTypeAndIsLeased = (img) => img.data.cost === cost.data && img.data?.leases?.data?.leases?.some(lease => lease.access === 'allow-use' && lease.active);
        const countLeased = ctrl.selectedImages.count(imageIsOfThisTypeAndIsLeased);
        const percentageLeased = Math.floor(100 * countLeased / cost.count);

        return {
          'background-image': `linear-gradient(90deg, teal 0 ${percentageLeased}%, ${alt} ${percentageLeased}% 100%)`
        };
      };
    };
  }
]);
