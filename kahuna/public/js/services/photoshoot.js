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
            return trackAll($rootScope, "photoshoot", images, image =>
                putPhotoshoot({data, image})
            );
        }

        function batchRemove({ images }) {
            const key = "photoshoot-remove";
            let completed = 0;

            $rootScope.$broadcast("events:batch-operations:start",
                { key, completed: 0, total: images.length });

            return $q.all(images.map(image =>
                deletePhotoshoot({ image }).then(r => {
                    completed++;
                    $rootScope.$broadcast("events:batch-operations:progress", { key, completed });
                    return r;
                })
            )).then(r => {
                $rootScope.$broadcast("events:batch-operations:complete", { key });
                return r;
            }).catch(err => {
                $rootScope.$broadcast("events:batch-operations:complete", { key });
                throw err;
            });
        }

        function putPhotoshoot({ data, image }) {
            return imageAccessor.getPhotoshoot(image)
                .put({ data })
                .then(newPhotoshoot => apiPoll(() => untilEqual({
                    image,
                    expectedPhotoshoot: newPhotoshoot.data
                })))
                .then(newImage => {
                    $rootScope.$emit('image-updated', newImage, image);
                    return newImage;
                });
        }

        function deletePhotoshoot({ image }) {
            return imageAccessor.getPhotoshoot(image)
                .delete()
                .then(() => apiPoll(() => untilEqual({image, expectedPhotoshoot: undefined })))
                .then(newImage => {
                    $rootScope.$emit('image-updated', newImage, image);
                    return newImage;
                });
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
