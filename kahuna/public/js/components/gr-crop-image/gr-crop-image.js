import angular from 'angular';

import template from './gr-crop-image.html';

import '../../services/api/leases';

export const cropImage = angular.module('gr.cropImage', [

]);

cropImage.controller('grCropImageCtrl', [
    '$scope', 'mediaCropper', 'onValChange', 'leaseService', '$rootScope',
    function ($scope, mediaCropper, onValChange, leaseService,  $rootScope) {
        let ctrl = this;

        function updateState () {
            ctrl.image.get().then(image => {
                ctrl.canBeCropped = image.data.valid;
            });
        }

        $rootScope.$on('leases-updated', () => {
            updateState();
        });

        $scope.$watch(() => ctrl.image.data.usageRights, onValChange(() => updateState()));
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
            trackingLocation: '@',
            hasFullCrop: '='
        },
        template: template
    };
}]);
