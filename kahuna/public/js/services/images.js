import angular from 'angular';

export const imagesService = angular.module('kahuna.services.images', []);

imagesService.factory('imagesService', [
    'mediaApi',
    function(mediaApi) {
        // Global session-level state to remember the uploadTime of the first
        // result in the last search.  This allows to always paginate the same
        // set of results, as well as recovering the same set of results if
        // navigating back to the same search.
        // Note: I tried to do this using non-URL $stateParams and it was a
        // rabbit-hole that doesn't seem to have any end. Hence this slightly
        // horrid global state.
        let lastSearchFirstResultTime;
        let total = 0;
        let images = [];

        function getImageOffset(id, offset) {
            return images[images.findIndex(i => i.data.id === id) + offset];
        }
        function checkForNewImages($stateParams, {until, since, offset, length, orderBy} = {}) {
            return internalSearch($stateParams, {until, since, offset, length, orderBy} );
        }

        function search($stateParams, {until, since, offset, length, orderBy} = {}) {
            return internalSearch($stateParams, {until, since, offset, length, orderBy} ).then(i => {
                images = i.data;
                total = i.total;
                return i;
            });
        }

        function internalSearch($stateParams, {until, since, offset, length, orderBy} = {}) {
            // FIXME: Think of a way to not have to add a param in a million places to add it

            /*
                * @param `until` can have three values:
                *
                * - `null`      => Don't send over a date, which will default to `now()` on the server.
                *                  Used in `checkForNewImages` with no until in `stateParams` to search
                *                  for the new image count
                *
                * - `string`    => Override the use of `stateParams` or `lastSearchFirstResultTime`.
                *                  Used in `checkForNewImages` when a `stateParams.until` is set.
                *
                * - `undefined` => Default. We then use the `lastSearchFirstResultTime` if available to
                *                  make sure we aren't loading any new images into the result set and
                *                  `checkForNewImages` deals with that. If it's the first search, we
                *                  will use `stateParams.until` if available.
                */

            if (angular.isUndefined(until)) {
                until = lastSearchFirstResultTime || $stateParams.until;
            }
            if (angular.isUndefined(since)) {
                since = $stateParams.since;
            }
            if (angular.isUndefined(orderBy)) {
                orderBy = $stateParams.orderBy;
            }

            return mediaApi.search($stateParams.query, angular.extend({
                ids:        $stateParams.ids,
                archived:   $stateParams.archived,
                free:       $stateParams.nonFree === 'true' ? undefined : true,
                // Disabled while paytype filter unavailable
                //payType:    $stateParams.payType || 'free',
                uploadedBy: $stateParams.uploadedBy,
                takenSince: $stateParams.takenSince,
                takenUntil: $stateParams.takenUntil,
                modifiedSince: $stateParams.modifiedSince,
                modifiedUntil: $stateParams.modifiedUntil,
                until:      until,
                since:      since,
                offset:     offset,
                length:     length,
                orderBy:    orderBy,
                hasRightsAcquired: $stateParams.hasRightsAcquired,
                hasCrops: $stateParams.hasCrops,
                syndicationStatus: $stateParams.syndicationStatus
            }));
                };

        return {
            checkForNewImages,
            search,
            getImageOffset,
            getImages: () => images,
            getTotal: () => total,
            getLastSearchFirstResultTime: () => lastSearchFirstResultTime,
            setLastSearchFirstResultTime: (t) => lastSearchFirstResultTime = t
        };
}]);
