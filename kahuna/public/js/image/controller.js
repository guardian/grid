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

        ctrl.originalMetadata = image.data.originalMetadata;

        ctrl.resource = image.data.userMetadata.data.metadata;

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
            var toUpdate = {};

            Object.keys(ctrl.originalMetadata).forEach(function (key) {
                if (ctrl.originalMetadata[key] !== updated[key]) {
                    toUpdate[key] = updated[key];
                }
            });

            return toUpdate;
        }

        ctrl.save = function (metadata) {
            return editsService
                .update(ctrl.resource, metadata, ctrl.image)
                .then(resource => {
                    ctrl.resource = resource;
                });
        };

        function _updateMetadata (field, value) {
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

            return ctrl
                .save(changed)
                .catch(() => {
                    return 'failed to save (press esc to cancel)';
                });
        }

        ctrl.updateTitle = (value) => { return _updateMetadata('title', value); };

        ctrl.updateDescription = (value) => { return _updateMetadata('description', value); };

        ctrl.updateByline = (value) => { return _updateMetadata('byline', value); };

        ctrl.updateCredit = (value) => { return _updateMetadata('credit', value); };
    }]);
