import angular from 'angular';
import templateUpload from './list-editor-upload.html';
import templateCompact from './list-editor-compact.html';
import templateInfoPanel from './list-editor-info-panel.html';
import './list-editor.css';
import '../services/image-list';
import '../util/storage';

import '../search/query-filter';

export var listEditor = angular.module('kahuna.edits.listEditor', [
    'kahuna.search.filters.query',
    'kahuna.services.image-logic',
    'util.storage'
]);

listEditor.controller('ListEditorCtrl', [
    '$rootScope',
    '$scope',
    '$window',
    '$timeout',
    'imageLogic',
    'imageList',
    'storage',
    'searchWithModifiers',
    function($rootScope,
            $scope,
            $window,
            $timeout,
            imageLogic,
            imageList,
            storage,
            searchWithModifiers) {
    var ctrl = this;

    ctrl.$onInit = () => {

      const retrieveElementsWithOccurrences = (images) => imageList.getOccurrences(images.flatMap(img => ctrl.accessor(img)));

      $scope.$watchCollection('ctrl.images', updatedImages => updateHandler(updatedImages));

      const updateHandler = (maybeUpdatedImages) => {
          ctrl.images.forEach((img, index) => {
              const updatedImage = maybeUpdatedImages.find(x => imageLogic.isSameImage(x, img));
              if (updatedImage) {
                  ctrl.images[index] = updatedImage;
              }
          });

          ctrl.listWithOccurrences = retrieveElementsWithOccurrences(ctrl.images);
          ctrl.plainList = ctrl.listWithOccurrences.map(x => x.data);
      };

      const updateListener = $rootScope.$on('images-updated', (e, updatedImages) => {
          updateHandler(updatedImages);
      });

      ctrl.listWithOccurrences = retrieveElementsWithOccurrences(ctrl.images);
      ctrl.plainList = ctrl.listWithOccurrences.map(x => x.data);
      ctrl.imageRemovedElements = [];

      function saveFailed(e) {
          console.error(e);
          $window.alert('Something went wrong when saving, please try again!');
      }

      ctrl.addElements = (elements, elementName, removedElements, originatingImage) => {
          ctrl.adding = true;

          //-clear removed list-
          let ctrlElementName = ctrl.elementNamePlural ? ctrl.elementNamePlural : ctrl.elementName;
          if (removedElements && removedElements.length > 0 && ctrlElementName === elementName) {
            ctrl.images.forEach(img => {
              if (img.uri === originatingImage) {
                ctrl.imageRemovedElements = [];
              }
            });
          }

          ctrl.addToImages(ctrl.images, elements, elementName, removedElements)
              .then(imgs => {
                  updateHandler(imgs);
              })
              .catch(saveFailed)
              .finally(() => {
                  ctrl.adding = false;
              });
      };

      ctrl.elementsBeingRemoved = new Set();
      ctrl.removeElement = element => {
          ctrl.elementsBeingRemoved.add(element);

          //-track removed elements from list-
          ctrl.imageRemovedElements.push(element);

          ctrl.removeFromImages(ctrl.images, element, "")
              .then(imgs => {
                  updateHandler(imgs);
              })
              .catch(saveFailed)
              .finally(() => {
                  ctrl.elementsBeingRemoved.delete(element);
              });
      };

      ctrl.removeAll = (elementName) => {
          if (ctrl.removeAsArray || ctrl.removeAsArray === "true") {
            if (ctrl.plainList.length > 0) {
              ctrl.removeFromImages(ctrl.images, ctrl.plainList, elementName);
            }
          } else {
            ctrl.plainList.forEach(element => ctrl.removeFromImages(ctrl.images, element, elementName));
          }
      };

      ctrl.srefNonfree = () => storage.getJs("isNonFree", true) ? true : undefined;

      const batchAddEvent = 'events:batch-apply:add-all';
      const batchRemoveEvent = 'events:batch-apply:remove-all';

      if (Boolean(ctrl.withBatch)) {
          $scope.$on(batchAddEvent, (e, elements, elementName, removedElements, originatingImage) =>
            ctrl.addElements(elements, elementName, removedElements, originatingImage));
          $scope.$on(batchRemoveEvent, (e, elementName) => ctrl.removeAll(elementName));

          ctrl.batchApply = (elementName = '') => {
              var elements = ctrl.plainList;
              var removedElements = ctrl.imageRemovedElements;
              var imageUri = ctrl.images[0].uri;

              if (elements.length > 0) {
                  $rootScope.$broadcast(batchAddEvent, elements, elementName, removedElements, imageUri);
              } else {
                  ctrl.confirmDelete = true;

                  $timeout(() => {
                      ctrl.confirmDelete = false;
                  }, 5000);
              }
          };

          ctrl.batchRemove = (elementName = '') => {
              ctrl.confirmDelete = false;
              $rootScope.$broadcast(batchRemoveEvent, elementName);
          };
      }

      $scope.$on('$destroy', function() {
          updateListener();
      });

      ctrl.searchWithModifiers = searchWithModifiers;
    };
}]);

listEditor.directive('uiListEditorUpload', [function() {
    return {
        restrict: 'E',
        scope: {
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            images: '<',
            withBatch: '=?',
            addToImages: '=',
            removeFromImages: '=',
            removeAsArray: '=',
            accessor: '=',
            queryFilter: '@',
            elementName: '@',
            elementNamePlural: '@'
        },
        controller: 'ListEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: templateUpload
    };
}]);

listEditor.directive('uiListEditorCompact', [function() {
    return {
        restrict: 'E',
        scope: {
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            images: '<',
            disabled: '=',
            removeFromImages: '=',
            accessor: '=',
            queryFilter: '@',
          elementName: '@'
        },
        controller: 'ListEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: templateCompact
    };
}]);

listEditor.directive('uiListEditorInfoPanel', [function() {
    return {
        restrict: 'E',
        scope: {
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            images: '<',
            disabled: '<',
            addToImages: '<',
            removeFromImages: '<',
            accessor: '<',
            isEditable: '<',
            queryFilter: '@',
            elementName: '@'
        },
        controller: 'ListEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: templateInfoPanel
    };
}]);
