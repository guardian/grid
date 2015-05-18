import angular from 'angular';

import '../edits/service';
import '../analytics/track';

var image = angular.module('kahuna.image.controller', ['kahuna.edits.service', 'analytics.track']);

image.controller('ImageCtrl', [
    '$rootScope',
    '$scope',
    'onValChange',
    'image',
    'optimisedImageUri',
    'cropKey',
    'mediaCropper',
    'editsService',
    'track',

    function ($rootScope,
              $scope,
              onValChange,
              image,
              optimisedImageUri,
              cropKey,
              mediaCropper,
              editsService,
              track) {

        var ctrl = this;

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

        mediaCropper.getCropsFor(image).then(crops => {
            ctrl.crops = crops;
            ctrl.crop = crops.find(crop => crop.id === cropKey);
        });

        mediaCropper.canBeCropped(image).then(croppable => {
            ctrl.canBeCropped = croppable;
        });

        editsService.canUserEdit(image).then(editable => {
            ctrl.userCanEdit = editable;
        });

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

        function getMetadataDiff (updated) {
            var diff = {};

            // jscs has a maximumLineLength of 100 characters, hence the line break
            var keys = new Set(Object.keys(updated).concat(
                Object.keys(image.data.originalMetadata)));

            // Keywords is an array, the comparison below only works with string comparison.
            // For simplicity, ignore keywords as we're not updating this field at the moment.
            keys.delete('keywords');

            keys.forEach((key) => {
                if (updated[key] !== image.data.originalMetadata[key]) {
                    // if the user has provided an override of '' (e.g. they want remove the title),
                    // angular sets the value in the object to undefined.
                    // We need to use an empty string in the PUT request to obey user input.
                    diff[key] = updated[key] || '';
                }
            });

            return diff;
        }

        function save (metadata) {
            return editsService.update(image.data.userMetadata.data.metadata, metadata, ctrl.image);
        }

        ctrl.updateMetadata = function (field, value) {
            if (ctrl.metadata[field] === value) {
                /*
                 Nothing has changed.

                 Per the angular-xeditable docs, returning false indicates success but model
                 will not be updated.

                 http://vitalets.github.io/angular-xeditable/#onbeforesave
                 */
                return false;
            }

            var proposedMetadata = angular.copy(ctrl.metadata);
            proposedMetadata[field] = value;

            var changed = getMetadataDiff(proposedMetadata);

            return save(changed)
                .then(() => {
                    track('Metadata edit', {successful: true, field: field});
                })
                .catch(() => {
                    track('Metadata edit', {successful: false, field: field});

                    /*
                     Save failed.

                     Per the angular-xeditable docs, returning a string indicates an error and will
                     not update the local model, nor will the form close (so the edit is not lost).
                     Instead, a message is shown and the field keeps focus for user to edit again.

                     http://vitalets.github.io/angular-xeditable/#onbeforesave
                     */
                    return 'failed to save (press esc to cancel)'
                });
        };
    }]);
