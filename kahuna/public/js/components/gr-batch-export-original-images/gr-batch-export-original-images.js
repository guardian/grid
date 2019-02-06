import angular from 'angular';

import template from './gr-batch-export-original-images.html';

export const batchExportOriginalImages = angular.module('gr.batchExportOriginalImages', []);

batchExportOriginalImages.controller('grBatchExportOriginalImagesCtrl', [
    '$scope', '$rootScope', '$state', 'mediaCropper',
    function($scope, $rootScope, $state, mediaCropper) {
        let ctrl = this;

        const checkForFullCrops = () => ctrl.images.every(
            image => image.data.exports.some(
              crop => crop.specification.type === 'full'
            )
        );

        $scope.$watch('ctrl.images', () => {
          ctrl.allHaveFullCrops = checkForFullCrops();
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

        function cropImages() {
            ctrl.cropping = true;
            ctrl.needsConfirmation = false;
            const cropImages = ctrl.images.map(image => {
              mediaCropper.createFullCrop(image).then(crop => {
                  //Global notification of action
                  $rootScope.$emit('events:crop-created', {
                      image: image,
                      crop: crop
                  });
              });
            });

            Promise.all(cropImages).finally(() => {
              ctrl.cropping = false;
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
            confirmed: '='
        },
        template: template
    };
}]);
