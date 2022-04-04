import angular from 'angular';
import templateUpload from './list-editor-upload.html';
import templateCompact from './list-editor-compact.html';
import templateInfoPanel from './list-editor-info-panel.html';
import './list-editor.css';
import '../services/image-list';

import '../search/query-filter';

export var listEditor = angular.module('kahuna.edits.listEditor', [
    'kahuna.search.filters.query',
    'kahuna.services.image-logic'
]);

listEditor.controller('ListEditorCtrl', [
    '$rootScope',
    '$scope',
    '$window',
    '$timeout',
    'imageLogic',
    'imageList',
    function($rootScope,
            $scope,
            $window,
            $timeout,
            imageLogic,
            imageList) {
    var ctrl = this;

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

    function saveFailed(e) {
        console.error(e);
        $window.alert('Something went wrong when saving, please try again!');
    }

    ctrl.addElements = elements => {
        ctrl.adding = true;

        ctrl.addToImages(ctrl.images, elements)
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

        ctrl.removeFromImages(ctrl.images, element)
            .then(imgs => {
                updateHandler(imgs);
            })
            .catch(saveFailed)
            .finally(() => {
                ctrl.elementsBeingRemoved.delete(element);
            });
    };

    ctrl.removeAll = () => {
        ctrl.plainList.forEach(element => ctrl.removeFromImages(ctrl.images, element));
    };

    const batchAddEvent = 'events:batch-apply:add-all';
    const batchRemoveEvent = 'events:batch-apply:remove-all';

    if (Boolean(ctrl.withBatch)) {
        $scope.$on(batchAddEvent, (e, elements) => ctrl.addElements(elements));
        $scope.$on(batchRemoveEvent, () => ctrl.removeAll());

        ctrl.batchApply = () => {
            var elements = ctrl.plainList;

            if (elements.length > 0) {
                $rootScope.$broadcast(batchAddEvent, elements);
            } else {
                ctrl.confirmDelete = true;

                $timeout(() => {
                    ctrl.confirmDelete = false;
                }, 5000);
            }
        };

        ctrl.batchRemove = () => {
            ctrl.confirmDelete = false;
            $rootScope.$broadcast(batchRemoveEvent);
        };
    }

    $scope.$on('$destroy', function() {
        updateListener();
    });
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
            queryFilter: '@',
            elementName: '@'
        },
        controller: 'ListEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: templateInfoPanel
    };
}]);
