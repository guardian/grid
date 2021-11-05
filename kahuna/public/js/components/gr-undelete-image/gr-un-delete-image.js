import angular from 'angular';
import '../gr-confirm-delete/gr-confirm-delete';

export const undeleteImage = angular.module('gr.undeleteImage', [
    'gr.confirmDelete',
    'util.async'
]);

undeleteImage.controller('grUnDeleteImageCtrl', [
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

        ctrl.unDeleteImage = function (image) {
            return mediaApi.undelete(image.data.id)
                .then(() => pollDeleted(image))
                .catch((err) => {
                    $rootScope.$emit('image-delete-failure', err, image);
                });
        };

        ctrl.delete = function () {
            // HACK to wait for thrall to process the message so that when we
            // poll the api, it will be up to date.
            return $q.all(Array.from(ctrl.images.values()).map(image => ctrl.unDeleteImage(image)))
                .then(() => $rootScope.$emit('images-deleted', ctrl.images));
        };
    }
]);

undeleteImage.directive('grUnDeleteImage', [function () {
    return {
        restrict: 'E',
        template: `
            <gr-confirm-delete class="gr-delete-image"
                               gr-on-confirm="ctrl.delete()" gr-label="Undelete" gr-confirm="Confirm Undelete" gr-tooltip="UnDelete image" >
            </gr-confirm-delete>`,
        controller: 'grUnDeleteImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            images: '='
        }
    };
}]);
