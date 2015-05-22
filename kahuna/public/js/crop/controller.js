import angular from 'angular';

var crop = angular.module('kahuna.crop.controller', []);

crop.controller('ImageCropCtrl',
                ['$rootScope', '$stateParams', '$state', '$filter', 'mediaApi', 'mediaCropper',
                 'image', 'optimisedImageUri',
                 function($rootScope, $stateParams, $state, $filter, mediaApi, mediaCropper,
                  image, optimisedImageUri) {

    const ctrl = this;

    var imageId = $stateParams.imageId;
    ctrl.image = image;
    ctrl.optimisedImageUri = optimisedImageUri;

    ctrl.cropping = false;

    // Standard ratios
    ctrl.landscapeRatio = 5 / 3;
    ctrl.portraitRatio = 2 / 3;
    ctrl.freeRatio = null;

    const originalDimensions = image.data.source.dimensions;

    ctrl.aspect = ctrl.landscapeRatio;
    ctrl.coords = {
        x1: 0,
        y1: 0,
        // fill the image with the selection
        x2: originalDimensions.width,
        y2: originalDimensions.height
    };

    var cropWidth = () => Math.round(ctrl.coords.x2 - ctrl.coords.x1);
    var cropHeight = () => Math.round(ctrl.coords.y2 - ctrl.coords.y1);
    ctrl.cropSize = () => cropWidth() + ' x ' + cropHeight();
    ctrl.cropSizeWarning = () => cropWidth() < 500;

    ctrl.getRatioString = (aspect) => {
        if (Number(aspect) === ctrl.landscapeRatio) {
            return '5:3';
        } else if (Number(aspect) === ctrl.portraitRatio) {
            return '2:3';
        }
        // else undefined is fine
    };

    ctrl.crop = function() {
        // TODO: show crop
        var coords = {
            x: Math.round(ctrl.coords.x1),
            y: Math.round(ctrl.coords.y1),
            width:  cropWidth(),
            height: cropHeight()
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
    };

}]);
