import angular from 'angular';

import template from './gr-export-original-image.html!text';

export const exportOriginalImage = angular.module('gr.exportOriginalImage', [

]);

exportOriginalImage.controller('grExportOriginalImageCtrl', [
    '$scope', 'mediaCropper', 'onValChange',
    function ($scope, mediaCropper, onValChange) {
        let ctrl = this;
        //
        //function updateState () {
        //    mediaCropper.canBeCropped(ctrl.image).then(croppable => {
        //        ctrl.canBeCropped = croppable;
        //    });
        //}
        //
        //$scope.$watch(() => ctrl.image.data.metadata, onValChange(() => updateState()));
        //
        //updateState();
    }
]);

exportOriginalImage.directive('grExportOriginalImage', [function () {
    return {
        restrict: 'E',
        controller: 'grExportOriginalImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            image: '=',
            trackingLocation: '@'
        },
        template: template
    };
}]);
