import angular from 'angular';

import template from './gr-crop-image.html!text';

export const cropImage = angular.module('gr.cropImage', [

]);

cropImage.controller('grCropImageCtrl', [
    '$scope', 'mediaCropper', 'onValChange',
    function ($scope, mediaCropper, onValChange) {
        let ctrl = this;

        function updateState () {
            mediaCropper.canBeCropped(ctrl.image).then(croppable => {
                ctrl.canBeCropped = croppable;
            });
        }

        $scope.$watch(() => ctrl.image.data.metadata, onValChange(() => updateState()));

        updateState();
    }
]);

cropImage.directive('grCropImage', [function () {
    return {
        restrict: 'E',
        controller: 'grCropImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            image: '=',
            trackingLocation: '@'
        },
        template: template
    };
}]);
