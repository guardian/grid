import angular from 'angular';

import '../services/preview-selection';
import '../services/scroll-position';
import '../util/async';
import '../util/seq';
import '../components/gu-lazy-table/gu-lazy-table';

export var results = angular.module('kahuna.search.results', [
    'kahuna.services.selection',
    'kahuna.services.scroll-position',
    'util.async',
    'util.seq',
    'gu.lazyTable'
]);


function compact(array) {
    return array.filter(angular.isDefined);
}

results.controller('SearchResultsCtrl', [
    '$rootScope',
    '$scope',
    '$state',
    '$stateParams',
    '$window',
    '$timeout',
    'delay',
    'onNextEvent',
    'scrollPosition',
    'mediaApi',
    'selectionService',
    'range',
    function($rootScope,
             $scope,
             $state,
             $stateParams,
             $window,
             $timeout,
             delay,
             onNextEvent,
             scrollPosition,
             mediaApi,
             selection,
             range) {

        const ctrl = this;

        ctrl.images = [];
        ctrl.newImagesCount = 0;

        // FIXME: This is being refreshed by the router.
        // Make it watch a $stateParams collection instead
        // See:   https://github.com/guardian/media-service/pull/64#discussion-diff-17351746L116
        ctrl.loading = true;

        ctrl.revealNewImages = revealNewImages;

        ctrl.getLastSeenVal = getLastSeenVal;
        ctrl.imageHasBeenSeen = imageHasBeenSeen;

        // Arbitrary limit of number of results; too many and the
        // scrollbar becomes hyper-sensitive
        ctrl.maxResults = 5000;

        // TODO: avoid this initial search (two API calls to init!)
        ctrl.searched = search({length: 0}).then(function(images) {
            ctrl.totalResults = images.total;

            // images is the array of loaded images, used for display
            ctrl.images = images.data;

            // imagesAll is a sparse array of all the results
            ctrl.imagesAll = [].concat(images.data);
            ctrl.imagesAll.length = Math.min(images.total, ctrl.maxResults);

            checkForNewImages();
        }).finally(() => {
            ctrl.loading = false;
        });


        ctrl.loadRange = function(start, end) {
            const length = end - start + 1;
            const latestTime = ctrl.images[0] && ctrl.images[0].data.uploadTime;
            search({offset: start, length: length, until: latestTime}).then(images => {
                // Update imagesAll with newly loaded images
                images.data.forEach((image, index) => {
                    // Only set images that were missing from the Array
                    // FIXME: might be safer to override, but causes
                    // issues with object identity in the ng:repeat
                    if (! ctrl.imagesAll[index + start]) {
                        ctrl.imagesAll[index + start] = image;
                    }
                });

                // images should not contain any 'holes'
                ctrl.images = compact(ctrl.imagesAll);
            });
        };

        // Safer than clearing the timeout in case of race conditions
        // FIXME: nicer (reactive?) way to do this?
        var scopeGone = false;
        $scope.$on('$destroy', () => {
            scopeGone = true;
        });


        // == Vertical position ==

        // Logic to resume vertical position when navigating back to the same results

        onNextEvent($scope, 'gu-lazy-table:height-changed').
            // Attempt to resume the top position ASAP, so as to limit
            // visible jump
            then(() => scrollPosition.resume($stateParams)).
            // When navigating back, resuming the position immediately
            // doesn't work, so we try again after a little while
            then(() => delay(30)).
            then(() => scrollPosition.resume($stateParams)).
            then(scrollPosition.clear);

        $scope.$on('$destroy', () => {
            scrollPosition.save($stateParams);
        });


        const pollingPeriod = 15 * 1000; // ms

        // FIXME: this will only add up to 50 images (search capped)
        function checkForNewImages() {
            $timeout(() => {
                const latestTime = ctrl.images[0] && ctrl.images[0].data.uploadTime;
                search({since: latestTime, length: 0}).then(resp => {
                    // FIXME: minor assumption that only the latest
                    // displayed image is matching the uploadTime
                    ctrl.newImagesCount = resp.total - 1;

                    if (! scopeGone) {
                        checkForNewImages();
                    }
                });
            }, pollingPeriod);
        }

        function revealNewImages() {
            // FIXME: should ideally be able to just call $state.reload(),
            // but there seems to be a bug (alluded to in the docs) when
            // notify is false, so forcing to true explicitly instead:
            $state.transitionTo($state.current, $stateParams, {
                reload: true, inherit: false, notify: true
            });
        }


        var seenSince;
        const lastSeenKey = 'search.seenFrom';

        function getLastSeenVal(image) {
            const key = getQueryKey();
            var val = {};
            val[key] = image.data.uploadTime;

            return val;
        }

        function imageHasBeenSeen(image) {
            return image.data.uploadTime <= seenSince;
        }

        $scope.$watch(() => $window.localStorage.getItem(lastSeenKey), function() {
            seenSince = getSeenSince();
        });

        // TODO: Move this into localstore service
        function getSeenSince() {
           return JSON.parse($window.localStorage.getItem(lastSeenKey) || '{}')[getQueryKey()];
        }

        function getQueryKey() {
            return $stateParams.query || '*';
        }


        function search({until, since, offset, length} = {}) {
            // FIXME: Think of a way to not have to add a param in a million places to add it
            return mediaApi.search($stateParams.query, angular.extend({
                ids:        $stateParams.ids,
                archived:   $stateParams.archived,
                // The nonFree state param is the inverse of the free API param
                free:       $stateParams.nonFree === 'true' ? undefined: true,
                uploadedBy: $stateParams.uploadedBy,
                // Override $stateParams until/since with any explicitly provided argument
                until:      until || $stateParams.until,
                since:      since || $stateParams.since,
                offset:     offset,
                length:     length
            }));
        }


        ctrl.selectedImages = selection.selectedImages;

        ctrl.inSelectionMode = () => ctrl.selectedImages.size > 0;

        ctrl.imageHasBeenSelected = (image) => selection.isSelected(image);

        ctrl.toggleSelection = (image, select) => selection.toggleSelection(image, select);

        ctrl.onImageClick = function (image, $event) {
            if (ctrl.inSelectionMode()) {
                if ($event.shiftKey) {
                    var selectedArray = Array.from(ctrl.selectedImages);
                    var lastSelected = selectedArray[selectedArray.length - 1];
                    var lastSelectedIndex = ctrl.images.findIndex(i => {
                        return i.data.id === lastSelected.data.id;
                    });

                    var imageIndex = ctrl.images.indexOf(image);

                    if (imageIndex === lastSelectedIndex) {
                        ctrl.toggleSelection(image, !ctrl.imageHasBeenSelected(image));
                        return;
                    }

                    var start = imageIndex > lastSelectedIndex ?
                        lastSelectedIndex : imageIndex;

                    var end = imageIndex > lastSelectedIndex ?
                        imageIndex : lastSelectedIndex;

                    for (let i of range(start, end)) {
                        ctrl.toggleSelection(ctrl.images[i], true);
                    }
                }
                else {
                    ctrl.toggleSelection(image, !ctrl.imageHasBeenSelected(image));
                }
            }
        };

        $rootScope.$on('image-updated', (e, updatedImage, oldImage) => {
            var index = ctrl.images.findIndex(i => i.data.id === updatedImage.data.id);
            if (index !== -1) {
                ctrl.images[index] = updatedImage;

                // FIXME: does this really belong here?
                if (ctrl.selectedImages.has(oldImage)) {
                    selection.remove(oldImage);
                    selection.add(updatedImage);
                }
            }

            var indexAll = ctrl.imagesAll.findIndex(i => i.data.id === updatedImage.data.id);
            if (indexAll !== -1) {
                ctrl.imagesAll[indexAll] = updatedImage;
            }
        });

        $scope.$on('$destroy', function() {
            selection.clear();
        });
    }
]);
