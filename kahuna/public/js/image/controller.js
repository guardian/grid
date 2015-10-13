import angular from 'angular';

import '../image/service';
import '../edits/service';
import '../analytics/track';
import '../components/gr-delete-image/gr-delete-image';
import '../components/gr-add-label/gr-add-label';
import '../downloader/downloader';
import '../components/gr-crop-image/gr-crop-image';
import '../components/gr-delete-crops/gr-delete-crops';
import '../components/gr-image-persist-status/gr-image-persist-status';
import '../components/gr-metadata-validity/gr-metadata-validity';
import '../components/gr-image-cost-message/gr-image-cost-message';

var image = angular.module('kahuna.image.controller', [
    'kahuna.edits.service',
    'gr.image.service',
    'analytics.track',
    'gr.deleteImage',
    'gr.addLabel',
    'gr.downloader',
    'gr.cropImage',
    'gr.deleteCrops',
    'gr.imagePersistStatus',
    'gr.metadataValidity',
    'gr.imageCostMessage'
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
    'editsService',
    'editsApi',
    'imageService',
    'track',

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
              editsService,
              editsApi,
              imageService,
              track) {

        var ctrl = this;

        ctrl.showUsageRights = false;

        ctrl.credits = function(searchText) {
            return ctrl.metadataSearch('credit', searchText);
        };

        ctrl.metadataSearch = (field, q) => {
            return mediaApi.metadataSearch(field,  { q }).then(resource => {
                return resource.data.map(d => d.key);
            });
        };

        ctrl.image = image;
        ctrl.usageRights = imageService(image).usageRights;
        ctrl.optimisedImageUri = optimisedImageUri;

        ctrl.setUsageCategory = (cats, categoryCode) => {
            const usageCategory = cats.find(cat => cat.value === categoryCode);

            ctrl.usageCategory = usageCategory ? usageCategory.name : categoryCode;
        };

        editsApi.getUsageRightsCategories().then((cats) => {
            ctrl.usageCategories = cats;
            ctrl.setUsageCategory(cats, ctrl.usageRights.data.category);
        });

        // TODO: we should be able to rely on ctrl.crop.id instead once
        // all existing crops are migrated to have an id (they didn't
        // initially)
        ctrl.cropKey = cropKey;

        // Alias for convenience in view
        ctrl.metadata = image.data.metadata;

        // Map of metadata location field to query filter name
        ctrl.locationFieldMap = {
            'subLocation': 'location',
            'city': 'city',
            'state': 'state',
            'country': 'country'
        };

        ctrl.isUsefulMetadata = isUsefulMetadata;
        ctrl.cropSelected = cropSelected;

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

        updateAbilities(image);

        var ignoredMetadata = [
            'title', 'description', 'copyright', 'keywords', 'byline',
            'credit', 'subLocation', 'city', 'state', 'country',
            'dateTaken', 'specialInstructions'
        ];

        function isUsefulMetadata(metadataKey) {
            return ignoredMetadata.indexOf(metadataKey) === -1;
        }

        function cropSelected(crop) {
            $rootScope.$emit('events:crop-selected', {
                image: ctrl.image,
                crop: crop
            });
        }

        function updateAbilities(image) {
            imageService(image).states.canDelete.then(deletable => {
                ctrl.canBeDeleted = deletable;
            });

            editsService.canUserEdit(image).then(editable => {
                ctrl.userCanEdit = editable;
            });
        }

        const freeUpdateListener = $rootScope.$on('image-updated', (e, updatedImage) => {
            ctrl.image = updatedImage;
            ctrl.usageRights = imageService(ctrl.image).usageRights;
            ctrl.metadata = updatedImage.data.metadata;
            ctrl.setUsageCategory(ctrl.usageCategories, ctrl.usageRights.data.category);
        });

        ctrl.updateMetadataField = function (field, value) {
            return editsService.updateMetadataField(ctrl.image, field, value)
                .then((updatedImage) => {
                    if (updatedImage) {
                        ctrl.image = updatedImage;
                        updateAbilities(updatedImage);
                        track.success('Metadata edit', { field: field });
                    }
                })
                .catch(() => {
                    track.failure('Metadata edit', { field: field });

                    /*
                     Save failed.

                     Per the angular-xeditable docs, returning a string indicates an error and will
                     not update the local model, nor will the form close (so the edit is not lost).
                     Instead, a message is shown and the field keeps focus for user to edit again.

                     http://vitalets.github.io/angular-xeditable/#onbeforesave
                     */
                    return 'failed to save (press esc to cancel)';
                });
        };

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
            freeUpdateListener();
            freeImageDeleteListener();
            freeImageDeleteFailListener();
        });
    }]);
