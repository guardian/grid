import angular from 'angular';

import '../gr-confirm-delete/gr-confirm-delete';
import './gr-delete-crops.css';

export const deleteCrops = angular.module('gr.deleteCrops', [
    'gr.confirmDelete'
]);

deleteCrops.controller('grDeleteCropsCtrl', ['$window', 'mediaCropper',
    function ($window, mediaCropper) {
        let ctrl = this;

        ctrl.active = false;

        mediaCropper.canDeleteCrops(ctrl.image).then(deleteCrops => {
            const deleteConfirmText = 'DELETE';
            if (deleteCrops) {
                activate();
                ctrl.delete = () => {
                    const superSure = $window.prompt(
                        'This should be used in regards to images requiring legal deletion only.' +
                        '\n\n' +
                        'If ANY of these crops are used on the site, or on any other public ' +
                        'platform, they will break if you choose to delete them.' +
                        '\n\n' +
                        'Type DELETE into the box below if you are 100% sure these images are ' +
                        'not used anywhere and you will never need them ever again.');

                    if (superSure === deleteConfirmText) {
                        deleteCrops().then(ctrl.onDelete);
                    }
                };
            }
        });

        function activate() {
            ctrl.active = true;
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
                data-cy="delete-all-crops-button"
                ng:if="ctrl.active"
                gr:label="Delete ALL crops"
                gr:on-confirm="ctrl.delete()">
            </gr-confirm-delete>
        `
    };
}]);
