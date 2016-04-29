import angular from 'angular';

import template from './gr-crop-image.html!text';

import {leaseService} from '../../services/api/leases'

export const cropImage = angular.module('gr.cropImage', [

]);

cropImage.controller('grCropImageCtrl', [
    '$scope', 'mediaCropper', 'onValChange', 'leaseService', '$rootScope',
    function ($scope, mediaCropper, onValChange, leaseService,  $rootScope) {
        let ctrl = this;

        function updateState () {
            mediaCropper.canBeCropped(ctrl.image).then(croppable => {
                if(croppable) {
                    leaseService.allowedByLease(ctrl.image).then(allowed => {
                        ctrl.canBeCropped = allowed;
                    })
                }
            });
        }

        $scope.$watch(() => ctrl.image.data.metadata, onValChange(() => updateState()));
        $rootScope.$on('leases-updated', () => updateState())
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
