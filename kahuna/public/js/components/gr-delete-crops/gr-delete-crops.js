import angular from 'angular';

import '../gr-confirm-delete/gr-confirm-delete';

export const deleteCrops = angular.module('gr.deleteCrops', [
    'gr.confirmDelete'
]);

deleteCrops.controller('grDeleteCropsCtrl', [
    '$scope', 'mediaCropper', 'onValChange',
    function ($scope, mediaCropper, onValChange) {
        let ctrl = this;

        ctrl.active = false;

        mediaCropper.canDeleteCrops(ctrl.image).then(action => {
            activate();
            ctrl.delete = action;
        }, deactivate);





        function activate() {
            ctrl.active = true;
        }

        function deactivate() {
            ctrl.active = false;
        }
    }
]);

deleteCrops.directive('grDeleteCrops', [function () {
    return {
        restrict: 'E',
        controller: 'grDeleteCropsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            image: '=grImage'
        },
        template: `
            <gr-confirm-delete
                gr:on-confirm="ctrl.delete()">
            </gr-confirm-delete>
        `
    };
}]);
