import angular from 'angular';
import '../gr-confirm-delete/gr-confirm-delete';

export const deleteImageV2 = angular.module('gr.deleteImageV2', [
    'gr.confirmDelete',
    'util.async'
]);

deleteImageV2.controller('grDeleteImageV2Ctrl', [
    '$rootScope', '$q', '$timeout', '$window', 'mediaApi', 'apiPoll',
    function ($rootScope, $q, $timeout, $window, mediaApi, apiPoll) {
        var ctrl = this;

        this.$onInit = () => {
          function pollDeleted (image) {
              const findImage = () => mediaApi.find(image.data.id).then(
                  (r) => {
                    if (r.data.softDeletedMetadata) {
                      // resolve when image has been soft deleted.
                      return $q.resolve();
                    } else {
                      return $q.reject();
                    }
                  },
                  // resolve when image cannot be found, i.e. image has been deleted.
                  () => $q.resolve()
              );

              return apiPoll(findImage);
          }

          ctrl.deleteImage = function (image) {
              return mediaApi.delete(image)
                  .then(() => pollDeleted(image))
                  .catch((err) => {
                      $rootScope.$emit('image-delete-failure', err, image);
                  });
          };

          ctrl.delete = function () {
            const deleteConfirmText = 'DELETE';
            const image = Array.from(ctrl.images.values())[0].data;
            const imageId = image.id;
            const usagesCount = image.usages.data.length;
            const cropsCount = image.exports.length;

            return mediaApi.capiUsages(imageId)
              .then(r => {
                if (r.data.articles.length > 0 || usagesCount > 0 || cropsCount > 0) {
                  const contents = r.data.articles.map(a => `${a.contentId} \n\t  ${a.images.join('\n\t ')}`);
                  return $window.prompt(
                    'This image is being used in the following articles: \n\n' +
                    `${contents.join('\n')}` +
                    '\n\n' +
                    `It has ${usagesCount} usages and ${cropsCount} crops. ` +
                    '\n\n' +
                    'Type DELETE into the box below if you are 100% sure these images are ' +
                    'not used anywhere and you will never need them ever again.'
                  );
                }
                return deleteConfirmText;
              })
              .then(superSure => {
                if (superSure === deleteConfirmText) {
                  return $q.all(Array.from(ctrl.images.values()).map(image => ctrl.deleteImage(image)))
                    .then(() => $rootScope.$emit('images-deleted', ctrl.images));
                }
              });
          };
        };
    }
]);

deleteImageV2.directive('grDeleteImageV2', [function () {
    return {
        restrict: 'E',
        template: `
            <gr-confirm-delete class="gr-delete-image"
                               gr-on-confirm="ctrl.delete()" gr-tooltip="Delete image V2">
            </gr-confirm-delete>`,
        controller: 'grDeleteImageV2Ctrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            images: '='
        }
    };
}]);

