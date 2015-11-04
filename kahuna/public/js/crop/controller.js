import angular from 'angular';

var crop = angular.module('kahuna.crop.controller', []);

crop.controller('ImageCropCtrl',
                ['$scope', '$rootScope', '$stateParams', '$state',
                 '$filter', '$document', 'mediaApi', 'mediaCropper',
                 'image', 'optimisedImageUri',
                 function($scope, $rootScope, $stateParams, $state,
                          $filter, $document, mediaApi, mediaCropper,
                          image, optimisedImageUri) {

    const ctrl = this;
    const body = $document[0].body;

    var imageId = $stateParams.imageId;
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

     function cropReturnKeyShortcut(event) {
         // check if ENTER key
         if (event.which === 13) {
             ctrl.callCrop();
         }
     }

     //TODO find a nicer way to handle keyboard shortcuts
     body.addEventListener('keypress', cropReturnKeyShortcut);

     $scope.$on('$destroy', function(){
         body.removeEventListener('keypress', cropReturnKeyShortcut);
     });
}]);
