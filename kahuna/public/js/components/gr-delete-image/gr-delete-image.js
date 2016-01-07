import angular from 'angular';
import '../gr-confirm-delete/gr-confirm-delete';

export const deleteImage = angular.module('gr.deleteImage', [
    'gr.confirmDelete',
    'util.async'
]);

deleteImage.controller('grDeleteImageCtrl', [
    '$rootScope', '$q', '$timeout', 'mediaApi', 'apiPoll',
    function ($rootScope, $q, $timeout, mediaApi, apiPoll) {
        var ctrl = this;

        function pollDeleted (image) {
            const findImage = () => mediaApi.find(image.data.id).then(
                () => $q.reject(),
                // resolve when image cannot be found, i.e. image has been deleted.
                () => $q.resolve()
            );

            apiPoll(findImage);
        }

        ctrl.deleteImage = function (image) {
            return mediaApi.delete(image)
                .then(() => pollDeleted(image))
                .catch((err) => {
                    $rootScope.$emit('image-delete-failure', err, image);
                });
        };

        ctrl.delete = function () {
            // HACK to wait for thrall to process the message so that when we
            // poll the api, it will be up to date.
            return $q.all(Array.from(ctrl.images.values()).map(image => ctrl.deleteImage(image)))
                .then(() => $rootScope.$emit('images-deleted', ctrl.images));
        };
    }
]);

deleteImage.directive('grDeleteImage', [function () {
    return {
        restrict: 'E',
        template: `
            <gr-confirm-delete class="gr-delete-image"
                               gr-on-confirm="ctrl.delete()" gr-tooltip="Delete image">
            </gr-confirm-delete>`,
        controller: 'grDeleteImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            images: '='
        }
    };
}]);
