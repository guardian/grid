import angular from 'angular';

import template from './gr-batch-export-original-images.html';

export const batchExportOriginalImages = angular.module('gr.batchExportOriginalImages', []);

batchExportOriginalImages.controller('grBatchExportOriginalImagesCtrl', [
    '$scope', '$rootScope', '$state', 'mediaCropper',
    function($scope, $rootScope, $state, mediaCropper) {
        let ctrl = this;

        ctrl.callBatchCrop = function() {
            //prevents return key on the crop button posting crop twice
            if (!ctrl.cropping) {
              cropImages();
            }
        };

        function cropImages() {
            ctrl.cropping = true;

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
            cropping: '='
        },
        template: template
    };
}]);
