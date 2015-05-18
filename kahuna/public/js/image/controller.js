import angular from 'angular';

import '../edits/service';

var image = angular.module('kahuna.image.controller', ['kahuna.edits.service']);

image.controller('ImageCtrl', [
    '$rootScope',
    '$scope',
    'onValChange',
    'image',
    'optimisedImageUri',
    'cropKey',
    'mediaCropper',
    'editsService',

    function ($rootScope,
              $scope,
              onValChange,
              image,
              optimisedImageUri,
              cropKey,
              mediaCropper,
              editsService) {

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

        const onMetadataUpdateEnd =
            editsService.on(image.data.userMetadata.data.metadata, 'update-end', onSave);

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

        function onSave () {
            return ctrl.image.get()
                .then(newImage => {
                    ctrl.image = newImage;
                })
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
                .catch(() => 'failed to save (press esc to cancel)');
        };

        $scope.$on('$destroy', () => {
            onMetadataUpdateEnd();
        });
    }]);
