import angular from 'angular';

import template from './gr-batch-export-original-images.html';
import { trackAll } from '../../util/batch-tracking';

export const batchExportOriginalImages = angular.module('gr.batchExportOriginalImages', []);

batchExportOriginalImages.controller('grBatchExportOriginalImagesCtrl', [
    '$q', '$scope', '$rootScope', '$state', 'mediaCropper',
    function($q, $scope, $rootScope, $state, mediaCropper) {
        let ctrl = this;

        const checkForFullCrops = () => ctrl.images.every(
            image => image.data.exports.some(
              crop => crop.specification.type === 'full'
            )
        );

        const croppable = () => ctrl.images.filter(
          image => image.data.valid && image.data.softDeletedMetadata === undefined &&
            image.data.exports.every(
              crop => crop.specification.type !== 'full'
            )
        );

        $scope.$watch('ctrl.images', () => {
          ctrl.allHaveFullCrops = checkForFullCrops();
          const croppableImages = croppable();

          ctrl.allCroppable = croppableImages.size === ctrl.images.size;
          ctrl.noneCroppable = croppableImages.size === 0;
        }, true);

        ctrl.callBatchCrop = function() {

            //Slightly backwards, if needsConfirmation is true, then this is second click
            if (ctrl.needsConfirmation) {
              ctrl.confirmed = true;
            }

            // Safety first
            if (!ctrl.confirmed) {
              ctrl.needsConfirmation = true;
            } else {
              //prevents return key on the crop button posting crop twice
              if (!ctrl.cropping) {
                cropImages();
              }

            }
        };

        ctrl.pageIsEmbedded = window.parent !== window;

        function cropImages() {
          ctrl.cropping = true;
          ctrl.needsConfirmation = false;

          const cropImages = trackAll($q, $rootScope, "crop", ctrl.images, async (image) => {
            const crop = image.data.exports.find(crop => crop.specification.type === 'full') || await mediaCropper.createFullCrop(image);
            return {
              image,
              crop
            };
          }, 'events:crops-created');

          cropImages.finally(() => {
            ctrl.cropping = false;
            ctrl.allHaveFullCrops = true;
          });
        }
    }
]);

batchExportOriginalImages.directive('grBatchExportOriginalImages', [function() {
    return {
        restrict: 'E',
        controller: 'grBatchExportOriginalImagesCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            images: '=',
            cropping: '=',
            needsConfirmation: '=',
            confirmed: '=',
            allCroppable: '=',
            noneCroppable: '=',
            allHaveFullCrops: '='
        },
        template: template
    };
}]);
