import angular from 'angular';

import { trackAll } from '../util/batch-tracking';

export const photoshootService = angular.module('kahuna.services.photoshoot', []);

photoshootService.factory('photoshootService', [
    '$rootScope', '$q', 'apiPoll', 'imageAccessor',
    function ($rootScope, $q, apiPoll, imageAccessor) {
        function add({ data, image }) {
            return batchAdd({ data, images: [image]}).then(updatedImages => updatedImages[0]);
        }

        function remove({ image }) {
            return batchRemove({ images: [image]}).then(updatedImages => updatedImages[0]);
        }

        function batchAdd({ data, images }) {
          const putPhotoshoot = (image) => imageAccessor.getPhotoshoot(image).put({ data });
          const waitForPhotoshootInApi = (image, newPhotoshoot) =>
            apiPoll(() =>
              untilEqual({
                image,
                expectedPhotoshoot: newPhotoshoot.data
              })
            );
          return trackAll(
            $q,
            $rootScope,
            "photoshoot",
            images,
            [ putPhotoshoot, waitForPhotoshootInApi],
            "images-updated"
          );
        }

      function batchRemove({ images }) {
        const removePhotoshoot = (image) =>
          imageAccessor.getPhotoshoot(image).delete();
        const waitForPhotoshootRemovedInApi = (image) =>
          apiPoll(() => untilEqual({ image, expectedPhotoshoot: undefined }));
        return trackAll(
          $q,
          $rootScope,
          "photoshoot",
          images,
          [removePhotoshoot, waitForPhotoshootRemovedInApi],
          "images-updated"
        );
      }

        function untilEqual({ image, expectedPhotoshoot }) {
            return image.get().then(apiImage => {
                const apiPhotoshoot = imageAccessor.getPhotoshoot(apiImage);
                return angular.equals(apiPhotoshoot.data, expectedPhotoshoot)
                    ? apiImage
                    : $q.reject();
            });
        }

        return {
            add,
            remove,
            batchAdd,
            batchRemove
        };
    }
]);
