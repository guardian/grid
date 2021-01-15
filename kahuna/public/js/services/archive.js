import angular from 'angular';
import { trackAll } from '../util/batch-tracking';

export const archiveService = angular.module('kahuna.services.archive', []);

archiveService.factory('archiveService',
                       ['$rootScope', '$q', 'apiPoll', 'imageAccessor',
                        function ($rootScope, $q, apiPoll, imageAccessor) {

    function untilArchivedEqual(image, expectedArchived) {
        return image.get().then(apiImage => {
            const apiArchived = imageAccessor.isArchived(apiImage);
            if (apiArchived === expectedArchived) {
                return apiImage;
            } else {
                return $q.reject();
            }
        });
    }

    function put (image, archived) {
        return image.data.userMetadata.data.archived
            .put({ data: archived })
            .then(newArchived => apiPoll(() => untilArchivedEqual(image, newArchived.data)))
            .then(newImage => {
              $rootScope.$emit('images-updated', [newImage]);
            });
    }

    function archive (image) {
        return put(image, true);
    }

    function unarchive (image) {
        return put(image, false);
    }

    function batchArchive (images) {
        return trackAll($q, $rootScope, "library", images, image => {
            // only make a PUT request to images that are not archived
            if (! imageAccessor.isArchived(image)) {
                return archive(image);
            }

            return Promise.resolve();
        });
    }

    function batchUnarchive (images) {
        return trackAll($q, $rootScope, "library", images, image => {
            // only make a PUT request to images that are archived
            if (imageAccessor.isArchived(image)) {
                return unarchive(image);
            }

            return Promise.resolve();
        });
    }

    return {
        archive,
        unarchive,
        batchArchive,
        batchUnarchive
    };
}]);

export default archiveService;
