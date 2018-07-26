import angular from 'angular';

export const albumService = angular.module('kahuna.services.album', []);

albumService.factory('albumService', [
    '$rootScope', '$q', 'apiPoll', 'imageAccessor',
    function ($rootScope, $q, apiPoll, imageAccessor) {
        function add({ data, image }) {
            return batchAdd({ data, images: [image]}).then(updatedImages => updatedImages[0]);
        }

        function remove({ image }) {
            return batchRemove({ images: [image]}).then(updatedImages => updatedImages[0]);
        }

        function batchAdd({ data, images }) {
            return $q.all(images.map(image => putAlbum({data, image})));
        }

        function batchRemove({ images }) {
            return $q.all(images.map(image => deleteAlbum({ image })));
        }

        function putAlbum({ data, image }) {
            return imageAccessor.getAlbum(image)
                .put({ data })
                .then(newAlbum => apiPoll(() => untilEqual({image, expectedAlbum: newAlbum.data})))
                .then(newImage => {
                    $rootScope.$emit('image-updated', newImage, image);
                    return newImage;
                });
        }

        function deleteAlbum({ image }) {
            return imageAccessor.getAlbum(image)
                .delete()
                .then(() => apiPoll(() => untilEqual({image, expectedAlbum: undefined })))
                .then(newImage => {
                    $rootScope.$emit('image-updated', newImage, image);
                    return newImage;
                });
        }

        function untilEqual({ image, expectedAlbum }) {
            return image.get().then(apiImage => {
                const apiAlbum = imageAccessor.getAlbum(apiImage);
                return angular.equals(apiAlbum.data, expectedAlbum) ? apiImage : $q.reject();
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
