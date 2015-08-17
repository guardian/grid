import angular from 'angular';
import '../gr-confirm-delete/gr-confirm-delete';

export const deleteImage = angular.module('gr.deleteImage', ['gr.confirmDelete']);

deleteImage.controller('grDeleteImageCtrl', ['$rootScope', '$q', 'mediaApi', function ($rootScope, $q, mediaApi) {
    var ctrl = this;

    ctrl.deleteImage = function (image) {
        return mediaApi.delete(image)
            .then((resp) => {
                $rootScope.$emit('image-deleted', image);
                if (angular.isDefined(ctrl.onSuccess)) {
                    ctrl.onSuccess(resp, image);
                }
            })
            .catch((err) => {
                if (angular.isDefined(ctrl.onError)) {
                    ctrl.onError(err, image);
                }
            });
    };

    ctrl.delete = function () {
        return $q.all(ctrl.images.map(image => ctrl.deleteImage(image)))};
}]);

deleteImage.directive('grDeleteImage', [function () {
    return {
        restrict: 'E',
        template: `
            <gr-confirm-delete class="gr-delete-image" gr-on-confirm="ctrl.delete()">
            </gr-confirm-delete>`,
        controller: 'grDeleteImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            images: '=',
            onSuccess: '=?',
            onError: '=?'
        }
    };
}]);
