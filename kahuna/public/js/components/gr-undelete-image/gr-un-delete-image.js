import angular from 'angular';
import '../gr-confirm-delete/gr-confirm-delete';

export const undeleteImage = angular.module('gr.undeleteImage', [
    'gr.confirmDelete',
    'util.async'
]);

undeleteImage.controller('grUnDeleteImageCtrl', [
    '$rootScope', '$q', 'mediaApi', 'apiPoll',
    function ($rootScope, $q, mediaApi, apiPoll) {
      var ctrl = this;

      ctrl.$onInit = () => {

        function pollUndeleted (image) {
            const findImage = () => mediaApi.find(image.data.id).then(
                (i) => i.data.softDeletedMetadata === undefined && i.data.userMetadata?.data?.archived
                    ? $q.resolve()
                    : $q.reject()
            );

            return apiPoll(findImage);
        }

        ctrl.unDeleteImage = function (image) {
            return mediaApi.undelete(image.data.id)
                .then(() => pollUndeleted(image))
                .catch((err) => {
                    $rootScope.$emit('image-undelete-failure', err, image);
                });
        };

        ctrl.unDeleteSelected = function () {
            // HACK to wait for thrall to process the message so that when we
            // poll the api, it will be up to date.
            return $q.all(Array.from(ctrl.images.values()).map(image => ctrl.unDeleteImage(image)))
                .then(() => $rootScope.$emit('images-undeleted', ctrl.images));
        };
      };
    }
]);

undeleteImage.directive('grUnDeleteImage', [function () {
    return {
        restrict: 'E',
        template: `
            <gr-confirm-delete class="gr-delete-image"
                               gr-on-confirm="ctrl.unDeleteSelected()" gr-label="Undelete" gr-confirm="Confirm Undelete" gr-tooltip="Undelete image" >
            </gr-confirm-delete>`,
        controller: 'grUnDeleteImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            images: '='
        }
    };
}]);
