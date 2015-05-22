import angular from 'angular';

var crop = angular.module('kahuna.crop.controller', []);

crop.controller('ImageCropCtrl',
                ['$scope', '$stateParams', '$state', '$filter', 'mediaApi', 'mediaCropper',
                 'image', 'optimisedImageUri',
                 function($scope, $stateParams, $state, $filter, mediaApi, mediaCropper,
                  image, optimisedImageUri) {

    const ctrl = this;

    var imageId = $stateParams.imageId;
    $scope.image = image;
    $scope.optimisedImageUri = optimisedImageUri;

    ctrl.cropping = false;

    // Standard ratios
    $scope.landscapeRatio = 5 / 3;
    $scope.portraitRatio = 2 / 3;
    $scope.freeRatio = null;

    const originalDimensions = image.data.source.dimensions;

    // TODO: migrate the other properties to be on the ctrl (this) instead of $scope
    ctrl.aspect = $scope.landscapeRatio;
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
        if (Number(aspect) === $scope.landscapeRatio) {
            return '5:3';
        } else if (Number(aspect) === $scope.portraitRatio) {
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

        mediaCropper.createCrop($scope.image, coords, ratio).then(crop => {
            // Global notification of action
            $scope.$emit('events:crop-created', {
                image: $scope.image,
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
