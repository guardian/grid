import angular from 'angular';

import '../../services/image-accessor';
import '../../edits/service';
import '../../forms/datalist';

import './gr-add-keyword.css';
import template from './gr-add-keyword.html';

import '../../directives/gr-auto-focus';
import {overwrite} from "../../util/constants/editOptions";

export var addKeyword = angular.module('gr.addKeyword', [
  'gr.image.service',
  'kahuna.edits.service',
  'gr.autoFocus',
  'kahuna.forms.datalist'
]);

addKeyword.controller('GrAddKeywordCtrl', [
  '$window', '$scope', '$q', 'imageAccessor', 'editsService',
  function ($window, $scope, $q, imageAccessor, editsService) {

    let ctrl = this;
    ctrl.active = false;
    ctrl.descriptionOption = overwrite.key;

    const updateImages = (images, metadataFieldName, valueFn) => {
      let uptodateImages = [];
      images.map((image) => {
        editsService.batchUpdateMetadataField(
            [image],
            metadataFieldName,
            valueFn(image),
            ctrl.descriptionOption
        );

        //-ensure metadata in image is up-to-date-
        let tmpImages = $scope.$parent.ctrl.imageAsArray.filter(img => img.uri == image.uri);
        if (tmpImages.length > 0) {
          let uptodateImage = tmpImages[0];
          uptodateImage.data.metadata.keywords = valueFn(image);
          uptodateImages.push(uptodateImage);
        }
      });

      return Promise.resolve(uptodateImages);
    };

    const addXToImages = (metadataFieldName, accessor) => (images, addedX) => {
      return updateImages(
        images,
        metadataFieldName,
        (image) => {
          const currentXInImage = accessor(image);
          return currentXInImage ? [...currentXInImage, ...addedX] : [...addedX];
        }
      );
    };

    ctrl.keywordAccessor = (image) => imageAccessor.readMetadata(image).keywords;
    ctrl.addKeywordToImages = addXToImages('keywords', ctrl.keywordAccessor);

    ctrl.save = () => {
      let keywordList = ctrl.newKeyword.split(',').map(e => e.trim());
      let imageArray = $scope.$parent.ctrl.imageAsArray;

      if (keywordList) {
        save(keywordList, imageArray);
      }
    };

    ctrl.cancel = reset;

    function save(keyword, imageArray) {
      ctrl.adding = true;
      ctrl.active = false;
      ctrl.addKeywordToImages(imageArray, keyword)
        .then(() => {
          reset();
        })
        .catch(saveFailed)
        .finally(() => ctrl.adding = false);
    }

    function saveFailed(e) {
      console.error(e);
      $window.alert('Something went wrong when saving, please try again!');
      ctrl.active = true;
    }

    function reset() {
      ctrl.newKeyword = '';
      ctrl.active = false;
    }

    ctrl.keywordSearch = (q) => {
      //-current search always resolves to empty but retained as possible extension point-
      let a = q ? [] : [];
      return $q.resolve(a);
    };

    ctrl.keywordAppend = (currentVal, selectedVal) => {
      const beforeLastComma = currentVal.split(/, ?/).slice(0, -1);
      const fullText = beforeLastComma.concat(selectedVal);
      return fullText.join(', ');
    };

    ctrl.selectLastKeyword = (value) => {
      const afterComma = value.split(',').slice(-1)[0].trim();
      return afterComma;
    };

  }
  ]);

addKeyword.directive('grAddKeyword', [function () {
  return {
    restrict: 'E',
    scope: {
      grSmall: '=?',
      active: '=?'
    },
    controller: 'GrAddKeywordCtrl',
    controllerAs: 'ctrl',
    bindToController: true,
    template: template
  };
}]);
