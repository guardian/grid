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
import { editOptions, overwrite } from '../../util/constants/editOptions';
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
  'editsApi',
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
    editsService,
    editsApi) {

    const ctrl = this;

    ctrl.showUsageRights = false;

    inject$($scope, selectedImagesList$, ctrl, 'selectedImages');

    const selectedCosts$ = selectedImagesList$.
    map(imageList.getCostState).
    map(imageList.getOccurrences);
    inject$($scope, selectedCosts$, ctrl, 'selectedCosts');


    const selectedLabels$ = selectedImagesList$.
    map(imageList.getLabels).
    map(imageList.getOccurrences);
    inject$($scope, selectedLabels$, ctrl, 'selectedLabels');

    const selectedUsageRights$ = selectedImagesList$.map(selectedImagesList => {
      // FIXME: wrap into slightly weird shape expected by usage
      // rights editor component
      return selectedImagesList.map(image => {
        return {
          image: image,
          data: imageAccessor.readUsageRights(image)
        };
      });
    });
    const selectedUsageRightsArray$ = selectedUsageRights$.map(selectedUsageRights => {
      return selectedUsageRights.toArray();
    });

    const categoriesPromise = editsApi.getUsageRightsCategories();
    const usageRightsCategories$ = Rx.Observable.fromPromise(categoriesPromise);
    const selectedUsageCategory$ = Rx.Observable.combineLatest(
      selectedUsageRights$,
      usageRightsCategories$,
      (usageRights, categories) => {
        const categoryCode = usageRights.reduce((m, o) => {
          return (m == o.data.category) ? o.data.category : 'multiple categories';
        }, usageRights.first() && usageRights.first().data.category);

        const usageCategory = categories.find(cat => cat.value === categoryCode);
        return usageCategory ? usageCategory.name : categoryCode;
      }
    );

    inject$($scope, selectedUsageRightsArray$, ctrl, 'usageRights');
    inject$($scope, selectedUsageCategory$,    ctrl, 'usageCategory');


    // FIXME: distinct?
    const selectedMetadata$ = selectedImagesList$.
    map(imageList.getMetadata).
    map(imageList.getSetOfProperties);
    const rawMetadata$ = selectedMetadata$.map(selectedMetadata => {
      return selectedMetadata.map((values) => {
        switch (values.size) {
          case 0:  return undefined;
          case 1:  return values.first();
          default: return Array.from(values);
        }
      }).toObject();
    });
    const displayMetadata$ = selectedMetadata$.map(selectedMetadata => {
      return selectedMetadata.map((values) => {
        switch (values.size) {
          case 1:  return values.first();
          default: return undefined;
        }
      }).toObject();
    });
    inject$($scope, rawMetadata$, ctrl, 'rawMetadata');
    inject$($scope, displayMetadata$, ctrl, 'metadata');

    const extraInfo$ = selectedImagesList$.
    map(imageList.getExtraInfo).
    map(imageList.getSetOfProperties).
    map(extraInfo => extraInfo.map((values) => {
        switch (values.size) {
          case 0:  return undefined;
          case 1:  return values.first();
          default: return Array.from(values);
        }
      }).toObject()
    );

    inject$($scope, extraInfo$, ctrl, 'extraInfo');

    const selectionIsEditable$ = selectedImagesList$.
    map(list => list.map(editsService.canUserEdit).toArray()).
    map($q.all).
    flatMap(Rx.Observable.fromPromise).
    map(allEditable => allEditable.every(v => v === true));
    inject$($scope, selectionIsEditable$, ctrl, 'userCanEdit');

    ctrl.hasMultipleValues = (val) => Array.isArray(val) && val.length > 1;

    ctrl.credits = function(searchText) {
      return ctrl.metadataSearch('credit', searchText);
    };

    ctrl.metadataSearch = (field, q) => {
      return mediaApi.metadataSearch(field,  { q }).then(resource => {
        return resource.data.map(d => d.key);
      });
    };

    ctrl.descriptionOption = overwrite.key;

    ctrl.descriptionOptions = editOptions;

    ctrl.updateDescriptionField = function() {
      ctrl.updateMetadataField('description', ctrl.metadata.description);
    };

    ctrl.updateMetadataField = function (field, value) {
      var imageArray = Array.from(ctrl.selectedImages);

      return editsService.batchUpdateMetadataField(
        imageArray,
        field,
        value,
        ctrl.descriptionOption
      );
    };

    ctrl.addLabel = function (label) {
      var imageArray = Array.from(ctrl.selectedImages);
      labelService.batchAdd(imageArray, [label]);
    };

    ctrl.removeLabel = function (label) {
      var imageArray = Array.from(ctrl.selectedImages);
      labelService.batchRemove(imageArray, label);
    };
  }
]);
