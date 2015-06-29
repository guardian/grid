import angular from 'angular';

var archiveService = angular.module('kahuna.services.archive', []);

archiveService.factory('archiveService', ['$rootScope', '$q', function ($rootScope, $q) {
    function put (image, archived) {
        return image.data.userMetadata.data.archived
            .put({ data: archived })
            .then(resource => {
                image.data.userMetadata.data.archived = resource;
                $rootScope.$emit('image-updated', image, image);
            });
    }

    function archive (image) {
        return put(image, true);
    }

    function unarchive (image) {
        return put(image, false);
    }

    function batchArchive (images) {
        return $q.all(images.map(image => {
            // only make a PUT request to images that are not archived
            if (!image.data.userMetadata.data.archived.data) {
                return archive(image);
            }
        }));
    }

    function batchUnarchive (images) {
        return $q.all(images.map(image => {
            // only make a PUT request to images that are archived
            if (image.data.userMetadata.data.archived.data) {
                return unarchive(image);
            }
        }));
    }

    return {
        archive,
        unarchive,
        batchArchive,
        batchUnarchive
    };
}]);

export default archiveService;
