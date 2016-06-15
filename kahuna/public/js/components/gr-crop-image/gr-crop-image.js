import angular from 'angular';

import template from './gr-crop-image.html!text';

import '../../services/api/leases';

export const cropImage = angular.module('gr.cropImage', [

]);

cropImage.controller('grCropImageCtrl', [
    '$scope', 'mediaCropper', 'onValChange', 'leaseService', '$rootScope',
    function ($scope, mediaCropper, onValChange, leaseService,  $rootScope) {
        let ctrl = this;

        function updateState () {
            leaseService.allowedByLease(ctrl.image).then(allowed => {
                if (!angular.isDefined(allowed)) {
                    mediaCropper.canBeCropped(ctrl.image).then(croppable => {
                        ctrl.canBeCropped = croppable;
                    });
                } else if (allowed.match(/deny/i)) {
                    ctrl.canBeCropped = false;
                } else if (allowed.match(/allow/i)) {
                    ctrl.canBeCropped = true;
                }
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
