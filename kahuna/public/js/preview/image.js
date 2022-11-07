import angular from 'angular';
import Rx from 'rx';

import '../util/rx';
import '../util/storage';


import template from './image.html';
import templateLarge from './image-large.html';

import '../image/service';
import '../imgops/service';
import '../services/image/usages';
import '../services/label';
import '../services/image-accessor';
import '../components/gr-add-label/gr-add-label';
import '../components/gr-archiver-status/gr-archiver-status';
import '../components/gr-syndication-icon/gr-syndication-icon';

export var image = angular.module('kahuna.preview.image', [
    'gr.image.service',
    'gr.image-usages.service',
    'kahuna.services.label',
    'kahuna.services.image-accessor',
    'gr.addLabel',
    'gr.archiverStatus',
    'gr.syndicationIcon',
    'util.rx',
    'kahuna.imgops',
    'util.storage'
]);

image.controller('uiPreviewImageCtrl', [
    '$scope',
    'inject$',
    '$rootScope',
    '$window',
    'imageService',
    'imageUsagesService',
    'labelService',
    'imageAccessor',
    'storage',
    function (
        $scope,
        inject$,
        $rootScope,
        $window,
        imageService,
        imageUsagesService,
        labelService,
        imageAccessor,
        storage) {
      var ctrl = this;

      $scope.$watch(() => ctrl.image, (newImage) => {
          ctrl.imageAsArray = [newImage];
      });

      ctrl.addLabelToImages = labelService.batchAdd;
      ctrl.removeLabelFromImages = labelService.batchRemove;
      ctrl.labelAccessor = (image) => imageAccessor.readLabels(image).map(label => label.data);
      ctrl.imageAsArray = [ctrl.image];

    const updateImage = (updatedImage) => {
      ctrl.states = imageService(updatedImage).states;
      ctrl.image = updatedImage;
      ctrl.flagState = ctrl.states.costState;
      ctrl.imageAsArray = [updatedImage];
    };

    const freeImagesUpdateListener = $rootScope.$on('images-updated', (e, updatedImages) => {
      const maybeUpdatedImage = updatedImages.find(updatedImage => ctrl.image.data.id === updatedImage.data.id);
      if (maybeUpdatedImage) {
        updateImage(maybeUpdatedImage);
      }
    });

    ctrl.states = imageService(ctrl.image).states;

    ctrl.imageDescription = ctrl.states.isStaffPhotographer ?
        `${window._clientConfig.staffPhotographerOrganisation}-owned: ${ctrl.image.data.metadata.description}` :
        ctrl.image.data.metadata.description;

    ctrl.flagState = ctrl.states.costState;

    const hasPrintUsages$ =
        imageUsagesService.getUsages(ctrl.image).hasPrintUsages$;

    const hasDigitalUsages$ =
        imageUsagesService.getUsages(ctrl.image).hasDigitalUsages$;

    const recentUsages$ = imageUsagesService.getUsages(ctrl.image).recentUsages$;

    $scope.$on('$destroy', function() {
      freeImagesUpdateListener();
    });

    inject$($scope, recentUsages$, ctrl, 'recentUsages');
    inject$($scope, hasPrintUsages$, ctrl, 'hasPrintUsages');
    inject$($scope, hasDigitalUsages$, ctrl, 'hasDigitalUsages');

    ctrl.getCollectionStyle = collection => {
        return collection.data.cssColour && `background-color: ${collection.data.cssColour}`;
    };

    ctrl.srefNonfree = () => storage.getJs("isNonFree", true) ? true : undefined;

    ctrl.hasActiveAllowLease = ctrl.image.data.leases.data.leases.find(lease => lease.active && lease.access === 'allow-use');

    ctrl.showOverlay = (image) => $window._clientConfig.enableWarningFlags && ctrl.isSelected && (ctrl.showAlertOverlay(image) || ctrl.showWarningOverlay(image));
    ctrl.showAlertOverlay = (image) => Object.keys(image.data.invalidReasons).length > 0;
    ctrl.showWarningOverlay = (image) => image.data.cost === 'conditional';

    ctrl.getWarningMessage = (image) => {
      if (ctrl.hasActiveAllowLease !== undefined) {
        return $window._clientConfig.imagePreviewFlagLeaseAttachedCopy;
      }
      if (ctrl.showWarningOverlay(image) === true) {
        return $window._clientConfig.imagePreviewFlagWarningCopy;
      }
      if (ctrl.showAlertOverlay(image) === true) {
        return $window._clientConfig.imagePreviewFlagAlertCopy;
      }
    };

}]);

image.directive('uiPreviewImage', function() {
    return {
        restrict: 'E',
        scope: {
            image: '=',
            isSelected: '=',
            hideInfo: '=',
            selectionMode: '='
        },
        // extra actions can be transcluded in
        transclude: true,
        template: template,
        controller: 'uiPreviewImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    };
});

image.directive('uiPreviewImageLarge', ['observe$', 'inject$', 'imgops',
    function(observe$, inject$, imgops) {
        return {
            restrict: 'E',
            scope: {
                image: '=',
                hideInfo: '=',
                selectionMode: '='
            },
            // extra actions can be transcluded in
            transclude: true,
            template: templateLarge,
            controller: 'uiPreviewImageCtrl',
            controllerAs: 'ctrl',
            bindToController: true,
            link: function(scope, element, attrs, ctrl) {
                ctrl.loading = false;
                const image$ = new Rx.Subject();

                const optimisedImage$ = image$.flatMap((image) => {
                    return Rx.Observable.fromPromise(imgops.getFullScreenUri(image));
                }).debounce(5);

                scope.$watch(() => ctrl.image.data.id, () => {
                    ctrl.loading = true;
                    image$.onNext(ctrl.image);
                });

                inject$(scope, optimisedImage$, ctrl, 'optimisedImage');

                scope.$watch(() => ctrl.optimisedImage, () => ctrl.loading = false);
            }
        };
}]);

image.directive('grStopPropagation', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.on(attrs.grStopPropagation, e => e.stopPropagation());
        }
    };
});
