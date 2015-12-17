import angular from 'angular';
import 'angular-hotkeys';

var crop = angular.module('kahuna.crop.controller', ['cfp.hotkeys']);

crop.controller('ImageCropCtrl',
                ['$scope', '$rootScope', '$stateParams', '$state',
                 '$filter', '$document', 'mediaApi', 'mediaCropper',
                 'image', 'optimisedImageUri', 'hotkeys',
                 function($scope, $rootScope, $stateParams, $state,
                          $filter, $document, mediaApi, mediaCropper,
                          image, optimisedImageUri, hotkeys) {

    const ctrl = this;
    const imageId = $stateParams.imageId;

    hotkeys.bindTo($scope)
        .add({
            combo: 'esc',
            description: 'Cancel crop and return to image',
            callback: () => $state.go('image', {imageId: ctrl.image.data.id})
        })
        .add({
            combo: 'enter',
            description: 'Create crop',
            callback: () => ctrl.callCrop()
        });

    ctrl.image = image;
    ctrl.optimisedImageUri = optimisedImageUri;

    ctrl.cropping = false;

    // Standard ratios
    ctrl.landscapeRatio = 5 / 3;
    ctrl.portraitRatio = 2 / 3;
    ctrl.videoRatio = 16 / 9;
    ctrl.freeRatio = null;

    const originalDimensions = image.data.source.dimensions;
    ctrl.originalWidth  = originalDimensions.width;
    ctrl.originalHeight = originalDimensions.height;

    ctrl.aspect = ctrl.landscapeRatio;
    ctrl.coords = {
        x1: 0,
        y1: 0,
        // fill the image with the selection
        x2: ctrl.originalWidth,
        y2: ctrl.originalHeight
    };

    $scope.$watch('ctrl.aspect', (newAspect) => {
        // freeRatio's 'null' gets converted to empty string somehow, meh
        const isFreeRatio = newAspect === '';
        if (isFreeRatio) {
            ctrl.coords = {
                x1: 0,
                y1: 0,
                // fill the image with the selection
                x2: ctrl.originalWidth,
                y2: ctrl.originalHeight
            };
        }
    });

    ctrl.cropWidth = () => Math.round(ctrl.coords.x2 - ctrl.coords.x1);
    ctrl.cropHeight = () => Math.round(ctrl.coords.y2 - ctrl.coords.y1);
    ctrl.cropSizeWarning = () => ctrl.cropWidth() < 500;

    ctrl.getRatioString = (aspect) => {
        if (Number(aspect) === ctrl.landscapeRatio) {
            return '5:3';
        } else if (Number(aspect) === ctrl.portraitRatio) {
            return '2:3';
        } else if (Number(aspect) === ctrl.videoRatio) {
            return '16:9';
        }
        // else undefined is fine
    };

     function crop() {
         // TODO: show crop
         var coords = {
             x: Math.round(ctrl.coords.x1),
             y: Math.round(ctrl.coords.y1),
             width:  ctrl.cropWidth(),
             height: ctrl.cropHeight()
         };

         var ratio = ctrl.getRatioString(ctrl.aspect);

         ctrl.cropping = true;

         mediaCropper.createCrop(ctrl.image, coords, ratio).then(crop => {
             // Global notification of action
             $rootScope.$emit('events:crop-created', {
                 image: ctrl.image,
                 crop: crop
             });

             $state.go('image', {
                 imageId: imageId,
                 crop: crop.data.id
             });
         }).finally(() => {
             ctrl.cropping = false;
         });
     }

     ctrl.callCrop = function() {
         //prevents return keypress on the crop button posting crop twice
         if (!ctrl.cropping) {
             crop();
         }
     };
}]);
