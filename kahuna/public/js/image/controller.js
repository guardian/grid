import angular from 'angular';

import '../util/rx';
import '../services/image/usages';
import '../image/service';

import '../components/gr-add-label/gr-add-label';
import '../components/gr-archiver/gr-archiver';
import '../components/gr-collection-overlay/gr-collection-overlay';
import '../components/gr-crop-image/gr-crop-image';
import '../components/gr-delete-crops/gr-delete-crops';
import '../components/gr-delete-image/gr-delete-image';
import '../components/gr-downloader/gr-downloader';
import '../components/gr-export-original-image/gr-export-original-image';
import '../components/gr-image-cost-message/gr-image-cost-message';
import '../components/gr-image-metadata/gr-image-metadata';
import '../components/gr-image-usage/gr-image-usage';
import '../components/gr-keyboard-shortcut/gr-keyboard-shortcut';
import '../components/gr-metadata-validity/gr-metadata-validity';


var image = angular.module('kahuna.image.controller', [
    'util.rx',
    'kahuna.edits.service',
    'gr.image.service',
    'gr.image-usages.service',

    'gr.addLabel',
    'gr.archiver',
    'gr.collectionOverlay',
    'gr.cropImage',
    'gr.deleteCrops',
    'gr.deleteImage',
    'gr.downloader',
    'gr.exportOriginalImage',
    'gr.imageCostMessage',
    'gr.imageMetadata',
    'gr.imageUsage',
    'gr.keyboardShortcut',
    'gr.metadataValidity'
]);

image.controller('ImageCtrl', [
    '$rootScope',
    '$scope',
    '$state',
    '$window',
    'inject$',
    'image',
    'mediaApi',
    'optimisedImageUri',
    'lowResImageUri',
    'cropKey',
    'mediaCropper',
    'imageService',
    'imageUsagesService',
    'keyboardShortcut',

    function ($rootScope,
              $scope,
              $state,
              $window,
              inject$,
              image,
              mediaApi,
              optimisedImageUri,
              lowResImageUri,
              cropKey,
              mediaCropper,
              imageService,
              imageUsagesService,
              keyboardShortcut) {

        let ctrl = this;

        keyboardShortcut.bindTo($scope).add({
            combo: 'c',
            description: 'Crop image',
            callback: () => $state.go('crop', {imageId: ctrl.image.data.id})
        });

        ctrl.image = image;
        ctrl.optimisedImageUri = optimisedImageUri;
        ctrl.lowResImageUri = lowResImageUri;

        const usages = imageUsagesService.getUsages(ctrl.image);
        const usagesCount$ = usages.count$;

        inject$($scope, usagesCount$, ctrl, 'usagesCount');

        // TODO: we should be able to rely on ctrl.crop.id instead once
        // all existing crops are migrated to have an id (they didn't
        // initially)
        ctrl.cropKey = cropKey;

        ctrl.cropSelected = cropSelected;

        imageService(ctrl.image).states.canDelete.then(deletable => {
            ctrl.canBeDeleted = deletable;
        });

        ctrl.onCropsDeleted = () => {
            // a bit nasty - but it updates the state of the page better than trying to do that in
            // the client.
            $state.go('image', {imageId: ctrl.image.data.id, crop: undefined}, {reload: true});
        };

        // TODO: move this to a more sensible place.
        function getCropDimensions() {
            return {
                width: ctrl.crop.specification.bounds.width,
                height: ctrl.crop.specification.bounds.height
            };
        }
        // TODO: move this to a more sensible place.
        function getImageDimensions() {
            return ctrl.image.data.source.dimensions;
        }

        mediaCropper.getCropsFor(image).then(crops => {
            ctrl.crop = crops.find(crop => crop.id === cropKey);
            ctrl.fullCrop = crops.find(crop => crop.specification.type === 'full');
            ctrl.crops = crops.filter(crop => crop.specification.type === 'crop');
            //boolean version for use in template
            ctrl.hasFullCrop = angular.isDefined(ctrl.fullCrop);
            ctrl.hasCrops = ctrl.crops.length > 0;
        }).finally(() => {
            ctrl.dimensions = angular.isDefined(ctrl.crop) ?
                getCropDimensions() : getImageDimensions();

            if (angular.isDefined(ctrl.crop)) {
                ctrl.originalDimensions = getImageDimensions();
            }
        });

        function cropSelected(crop) {
            $rootScope.$emit('events:crop-selected', {
                image: ctrl.image,
                crop: crop
            });
        }

        const freeImageUpdateListener = $rootScope.$on('image-updated', (e, updatedImage) => {
            if (ctrl.image.data.id === updatedImage.data.id) {
                ctrl.image = updatedImage;
            }
        });

        const freeImageDeleteListener = $rootScope.$on('images-deleted', () => {
            $state.go('search');
        });

        const freeImageDeleteFailListener = $rootScope.$on('image-delete-failure', (err, image) => {
            if (err && err.body && err.body.errorMessage) {
                $window.alert(err.body.errorMessage);
            } else {
                // Possibly not receiving a proper image object sometimes?
                const imageId = image && image.data && image.data.id || 'Unknown ID';
                $window.alert(`Failed to delete image ${imageId}`);
            }
        });

        $scope.$on('$destroy', function() {
            freeImageUpdateListener();
            freeImageDeleteListener();
            freeImageDeleteFailListener();
        });
    }]);
