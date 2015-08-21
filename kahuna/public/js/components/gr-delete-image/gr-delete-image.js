import angular from 'angular';
import '../gr-confirm-delete/gr-confirm-delete';

export const deleteImage = angular.module('gr.deleteImage', ['gr.confirmDelete']);

deleteImage.controller('grDeleteImageCtrl', [
    '$rootScope', '$q', '$timeout', 'mediaApi',
    function ($rootScope, $q, $timeout, mediaApi) {
        var ctrl = this;

        ctrl.deleteImage = function (image) {
            return mediaApi.delete(image)
                .catch((err) => {
                    $rootScope.$emit('image-delete-failure', err, image);
                });
        };

        ctrl.delete = function () {
            // HACK to wait for thrall to process the message so that when we
            // poll the api, it will be up to date.
            return $q.all(Array.from(ctrl.images.values()).map(image => ctrl.deleteImage(image)))
                .then(() => {
                    $timeout(() => {
                        $rootScope.$emit('images-deleted', ctrl.images);
                    }, 1000);
                });
        };
    }
]);

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
            images: '='
        }
    };
}]);
