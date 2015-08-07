import angular from 'angular';
import '../gr-confirm-delete/gr-confirm-delete';

export const deleteImage = angular.module('gr.deleteImage', ['gr.confirmDelete']);

deleteImage.controller('grDeleteImageCtrl', ['$rootScope', '$scope', 'mediaApi',
    function ($rootScope, $scope, mediaApi) {
        var ctrl = this;

        ctrl.delete = function () {
            mediaApi.delete(ctrl.image)
                .then((resp) => {
                    if (angular.isDefined(ctrl.onSuccess)) {
                        ctrl.onSuccess(resp);
                    }
                })
                .catch((err) => {
                    if (angular.isDefined(ctrl.onError)) {
                        ctrl.onError(err);
                    }
                });
        };
}]);

deleteImage.directive('grDeleteImage', [function () {
    return {
        restrict: 'E',
        template: `
            <gr-confirm-delete class="gr-delete-image" gr-on-confirm="ctrl.delete()">
                <span class="gr-delete-image__label">Delete</span>
            </gr-confirm-delete>`,
        controller: 'grDeleteImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            image: '=',
            onSuccess: '=?',
            onError: '=?'
        }
    };
}]);
