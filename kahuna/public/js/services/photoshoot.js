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
          return trackAll(
            $rootScope,
            "photoshoot",
            images,
            [
              (image) => imageAccessor.getPhotoshoot(image).put({ data }),
              (image, newPhotoshoot) =>
                apiPoll(() =>
                  untilEqual({
                    image,
                    expectedPhotoshoot: newPhotoshoot.data,
                  })
                )
            ],
            "images-updated"
          );
        }

        function batchRemove({ images }) {
          return trackAll(
            $rootScope,
            "photoshoot",
            images,
            [
              (image) => imageAccessor.getPhotoshoot(image).delete(),
              (image) =>
                apiPoll(() =>
                  untilEqual({ image, expectedPhotoshoot: undefined })
                )
            ],
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
