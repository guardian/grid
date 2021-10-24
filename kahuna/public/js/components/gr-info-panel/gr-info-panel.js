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
  '$rootScope',
  '$scope',
  '$window',
  '$q',
  'inject$',
  'subscribe$',
  'mediaApi',
  'imageAccessor',
  'imageList',
  'selectedImagesList$',
  'labelService',
  'editsService',
  function (
    $rootScope,
    $scope,
    $window,
    $q,
    inject$,
    subscribe$,
    mediaApi,
    imageAccessor,
    imageList,
    selectedImagesList$,
    labelService,
    editsService) {

    const ctrl = this;

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

  }
]);
