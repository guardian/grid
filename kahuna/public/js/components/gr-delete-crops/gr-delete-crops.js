import angular from 'angular';

import '../gr-confirm-delete/gr-confirm-delete';
import './gr-delete-crops.css!';

export const deleteCrops = angular.module('gr.deleteCrops', [
    'gr.confirmDelete'
]);

deleteCrops.controller('grDeleteCropsCtrl', ['mediaCropper',
    function (mediaCropper) {
        let ctrl = this;

        ctrl.active = false;

        mediaCropper.canDeleteCrops(ctrl.image).then(deleteCrops => {
            activate();
            ctrl.delete = () => {
                deleteCrops().then(ctrl.onDelete);
            };
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
            image: '=grImage',
            onDelete: '&grOnDelete'
        },
        template: `
            <gr-confirm-delete
                class="delete-crops"
                gr:label="Delete crops"
                gr:on-confirm="ctrl.delete()">
            </gr-confirm-delete>
        `
    };
}]);
