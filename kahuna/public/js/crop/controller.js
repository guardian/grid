import angular from 'angular';

import '../components/gr-keyboard-shortcut/gr-keyboard-shortcut';

var crop = angular.module('kahuna.crop.controller', ['gr.keyboardShortcut']);

crop.controller('ImageCropCtrl',
                ['$scope', '$rootScope', '$stateParams', '$state',
                 '$filter', '$document', 'mediaApi', 'mediaCropper',
                 'image', 'optimisedImageUri', 'keyboardShortcut',
                 function($scope, $rootScope, $stateParams, $state,
                          $filter, $document, mediaApi, mediaCropper,
                          image, optimisedImageUri, keyboardShortcut) {

    const ctrl = this;
    const imageId = $stateParams.imageId;

    keyboardShortcut.bindTo($scope)
        .add({
            combo: 'esc',
            description: 'Cancel crop and return to image',
            callback: () => $state.go('image', {imageId: ctrl.image.data.id})
        })
        .add({
            combo: 'enter',
            description: 'Create crop',
            callback: () => ctrl.callCrop()
        })
        .add({
            combo: 'l',
            description: 'Start landscape crop',
            callback: () => {
                ctrl.aspect = ctrl.landscapeRatio;
            }
        })
        .add({
            combo: 's',
            description: 'Start square crop',
            callback: () => {
                ctrl.aspect = ctrl.squareRatio;
            }
        })
        .add({
            combo: 'p',
            description: 'Start portrait crop',
            callback: () => {
                ctrl.aspect = ctrl.portraitRatio;
            }
        })
        .add({
            combo: 'v',
            description: 'Start video crop',
            callback: () => {
                ctrl.aspect = ctrl.videoRatio;
            }
        })
        .add({
            combo: 'f',
            description: 'Start free-form crop',
            callback: () => {
                // freeRatio's 'null' gets converted to empty string somehow, meh
                ctrl.aspect = '';
            }
        });

    ctrl.image = image;
    ctrl.optimisedImageUri = optimisedImageUri;

    ctrl.cropping = false;

    // Standard ratios
    ctrl.squareRatio = 1;
    ctrl.landscapeRatio = 5 / 3;
    ctrl.portraitRatio = 4 / 5;
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


    const ratioString = (aspect) => {
        if (Number(aspect) === ctrl.landscapeRatio) {
            return '5:3';
        } else if (Number(aspect) === ctrl.portraitRatio) {
            return '4:5';
        } else if (Number(aspect) === ctrl.squareRatio) {
            return '1:1';
        } else if (Number(aspect) === ctrl.videoRatio) {
            return '16:9';
        }
        // else undefined is fine
    };

    ctrl.getRatioString = ratioString;

    // If we have a square crop, remove any jitter introduced by client lib by using only one side
    if (ratioString === '1:1') {
        const sideLength = () => Math.round(ctrl.coords.x2 - ctrl.coords.x1);
        ctrl.cropWidth = sideLength;
        ctrl.cropHeight = sideLength;
    } else {
        ctrl.cropWidth = () => Math.round(ctrl.coords.x2 - ctrl.coords.x1);
        ctrl.cropHeight = () => Math.round(ctrl.coords.y2 - ctrl.coords.y1);
    }

    ctrl.inputWidth = parseInt(ctrl.cropWidth());
    ctrl.inputHeight = parseInt(ctrl.cropHeight());

    ctrl.broadcastHeightChange = function (){
        $scope.$broadcast('user-height-change', ctrl.inputHeight);
    };
    ctrl.broadcastWidthChange = function (){
        $scope.$broadcast('user-width-change', ctrl.inputWidth);
    };

    //make the view match the ctrl value
    $scope.$watch(function(){ return ctrl.cropWidth(); }, function(){
        ctrl.inputWidth = ctrl.cropWidth();
    });
    $scope.$watch(function(){ return ctrl.cropHeight(); }, function(){
        ctrl.inputHeight = ctrl.cropHeight();
    });

    ctrl.cropSizeWarning = () => ctrl.cropWidth() < 500;

    ctrl.getRatioString = (aspect) => {
        if (Number(aspect) === ctrl.landscapeRatio) {
            return '5:3';
        } else if (Number(aspect) === ctrl.portraitRatio) {
            return '4:5';
        } else if (Number(aspect) === ctrl.squareRatio) {
            return '1:1';
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

