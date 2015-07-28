import angular from 'angular';

import '../edits/service';
import '../analytics/track';

var image = angular.module('kahuna.image.controller', ['kahuna.edits.service', 'analytics.track']);

image.controller('ImageCtrl', [
    '$rootScope',
    '$scope',
    'onValChange',
    'image',
    'mediaApi',
    'optimisedImageUri',
    'cropKey',
    'mediaCropper',
    'editsService',
    'track',

    function ($rootScope,
              $scope,
              onValChange,
              image,
              mediaApi,
              optimisedImageUri,
              cropKey,
              mediaCropper,
              editsService,
              track) {

        var ctrl = this;

        ctrl.credits = function(searchText) {
            return ctrl.metadataSearch('credit', searchText);
        };

        ctrl.metadataSearch = (field, q) => {
            return mediaApi.metadataSearch(field,  { q }).then(resource => {
                return resource.data.map(d => d.key);
            });
        };

        ctrl.image = image;

        ctrl.optimisedImageUri = optimisedImageUri;
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
            'dateTaken'
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
            mediaCropper.canBeCropped(image).then(croppable => {
                ctrl.canBeCropped = croppable;
            });

            editsService.canUserEdit(image).then(editable => {
                ctrl.userCanEdit = editable;
            });
        }

        ctrl.updateMetadataField = function (field, value) {
            return editsService.updateMetadataField(image, field, value)
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
    }]);
