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

      ctrl.$onInit = () => {

        function pollUndeleted (image) {
            const findImage = () => mediaApi.find(image.data.id).then(
                (r) => {
                  if (r.data.softDeletedMetadata) {
                    // reject until softdeleted metadata has been removed
                    return $q.reject();
                  } else {
                    return $q.resolve();
                  }
                },
                // reject while image cannot be found, i.e. image has been deleted, and not yet recovered.
                () => $q.reject()
            );

            apiPoll(findImage);
        }

        ctrl.undeleteImage = function (image) {
            return mediaApi.undelete(image.data.id)
                .then(() => pollUndeleted(image))
                .catch((err) => {
                    $rootScope.$emit('image-delete-failure', err, image);
                });
        };

        ctrl.undeleteSelected = function () {
            // HACK to wait for thrall to process the message so that when we
            // poll the api, it will be up to date.
            return $q.all(Array.from(ctrl.images.values()).map(image => ctrl.undeleteImage(image)))
              // Event name is "deleted", but we wait for undeletion too.
              .then(() => $rootScope.$emit('images-deleted', ctrl.images));
        };
      };
    }
]);

undeleteImage.directive('grUnDeleteImage', [function () {
    return {
        restrict: 'E',
        template: `
            <gr-confirm-delete class="gr-delete-image"
                               gr-on-confirm="ctrl.undeleteSelected()" gr-label="Undelete" gr-confirm="Confirm Undelete" gr-tooltip="Undelete image" >
            </gr-confirm-delete>`,
        controller: 'grUnDeleteImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            images: '='
        }
    };
}]);
