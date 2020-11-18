import angular from 'angular';

import template from './gr-image-metadata.html';

import '../../image/service';
import '../../edits/service';
import './gr-image-metadata.css';
import '../gr-description-warning/gr-description-warning';

export const module = angular.module('gr.imageMetadata', [
    'gr.image.service',
    'kahuna.edits.service',
    'gr.descriptionWarning'
]);

module.controller('grImageMetadataCtrl', [
    '$rootScope',
    '$scope',
    '$window',
    'imageService',
    'editsService',
    'mediaApi',
    'editsApi',
    'collections',

    function ($rootScope,
              $scope,
              $window,
              imageService,
              editsService,
              mediaApi,
              editsApi,
              collections) {

        let ctrl = this;

        ctrl.showUsageRights = false;
        ctrl.usageRights = imageService(ctrl.image).usageRights;

        // Alias for convenience in view
        ctrl.metadata = ctrl.image.data.metadata;
        ctrl.identifiers = ctrl.image.data.identifiers;

        ctrl.isUsefulMetadata = isUsefulMetadata;

        ctrl.hasLocationInformation = ctrl.metadata.subLocation ||
            ctrl.metadata.city ||
            ctrl.metadata.state ||
            ctrl.metadata.country;

        // Map of metadata location field to query filter name
        ctrl.locationFieldMap = {
            'subLocation': 'location',
            'city': 'city',
            'state': 'state',
            'country': 'country'
        };

        const ignoredMetadata = [
            'title', 'description', 'copyright', 'keywords', 'byline',
            'credit', 'subLocation', 'city', 'state', 'country',
            'dateTaken', 'specialInstructions', 'subjects', 'peopleInImage'
        ];

        ctrl.metadataSearch = (field, q) => {
            return mediaApi.metadataSearch(field,  { q }).then(resource => {
                return resource.data.map(d => d.key);
            });
        };

        ctrl.credits = function(searchText) {
            return ctrl.metadataSearch('credit', searchText);
        };

        ctrl.setUsageCategory = (cats, categoryCode) => {
            const usageCategory = cats.find(cat => cat.value === categoryCode);

            ctrl.usageCategory = usageCategory ? usageCategory.name : categoryCode;
        };

        editsApi.getUsageRightsCategories().then((cats) => {
            ctrl.usageCategories = cats;
            ctrl.setUsageCategory(cats, ctrl.usageRights.data.category);
        });

        updateAbilities(ctrl.image);

        function isUsefulMetadata(metadataKey) {
            return ignoredMetadata.indexOf(metadataKey) === -1;
        }

        function updateAbilities(image) {
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
                        $rootScope.$emit(
                          'track:event',
                          'Metadata',
                          'Edit',
                          'Success',
                          null,
                          {
                            field: field,
                            value: value
                          }
                        );
                    }
                })
                .catch(() => {
                  $rootScope.$emit(
                    'track:event',
                    'Metadata',
                    'Edit',
                    'Failure',
                    null,
                    {
                      field: field,
                      value: value
                    }
                  );

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

        ctrl.removeImageFromCollection = (collection) => {
            ctrl.removingCollection = collection;
            collections.removeImageFromCollection(collection, ctrl.image)
                .then(() => ctrl.removingCollection = false);
        };

        ctrl.displayLeases = () => {
            return ctrl.userCanEdit || ctrl.image.leases > 0;
        };

        $scope.$on('$destroy', function() {
            freeUpdateListener();
        });
    }
]);

module.directive('grImageMetadata', [function () {
    return {
        restrict: 'E',
        template: template,
        transclude: true,
        scope: {
            image: '=grImage'
        },
        controller: 'grImageMetadataCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    };
}]);
