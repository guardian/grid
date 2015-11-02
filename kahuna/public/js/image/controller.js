import angular from 'angular';

import '../image/service';
import '../components/gr-delete-image/gr-delete-image';
import '../components/gr-add-label/gr-add-label';
import '../downloader/downloader';
import '../components/gr-crop-image/gr-crop-image';
import '../components/gr-delete-crops/gr-delete-crops';
import '../components/gr-image-metadata/gr-image-metadata';
import '../components/gr-image-persist-status/gr-image-persist-status';
import '../components/gr-metadata-validity/gr-metadata-validity';
import '../components/gr-image-cost-message/gr-image-cost-message';
import '../components/gr-image-usage/gr-image-usage';

var image = angular.module('kahuna.image.controller', [
    'kahuna.edits.service',
    'gr.image.service',
    'gr.deleteImage',
    'gr.addLabel',
    'gr.downloader',
    'gr.cropImage',
    'gr.deleteCrops',
    'gr.imagePersistStatus',
    'gr.imageMetadata',
    'gr.metadataValidity',
    'gr.imageCostMessage',
    'gr.imageUsage'
]);

image.controller('ImageCtrl', [
    '$rootScope',
    '$scope',
    '$state',
    '$window',
    'onValChange',
    'image',
    'mediaApi',
    'optimisedImageUri',
    'cropKey',
    'mediaCropper',
    'imageService',

    function ($rootScope,
              $scope,
              $state,
              $window,
              onValChange,
              image,
              mediaApi,
              optimisedImageUri,
              cropKey,
              mediaCropper,
              imageService) {

        var ctrl = this;

        ctrl.image = image;
        ctrl.optimisedImageUri = optimisedImageUri;

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
            ctrl.crops = crops;
            ctrl.crop = crops.find(crop => crop.id === cropKey);
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
            freeImageDeleteListener();
            freeImageDeleteFailListener();
        });
    }]);
