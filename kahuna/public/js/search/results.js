import angular from 'angular';

import '../services/preview-selection';
import '../services/scroll-position';
import '../services/panel';
import '../util/async';
import '../util/seq';
import '../components/gu-lazy-table/gu-lazy-table';

export var results = angular.module('kahuna.search.results', [
    'kahuna.services.selection',
    'kahuna.services.scroll-position',
    'kahuna.services.panel',
    'util.async',
    'util.seq',
    'gu.lazyTable'
]);


function compact(array) {
    return array.filter(angular.isDefined);
}

// Global session-level state to remember the uploadTime of the first
// result in the last search.  This allows to always paginate the same
// set of results, as well as recovering the same set of results if
// navigating back to the same search.
// Note: I tried to do this using non-URL $stateParams and it was a
// rabbit-hole that doesn't seem to have any end. Hence this slightly
// horrid global state.
let lastSearchFirstResultTime;

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
    'panelService',
    'range',
    'isReloadingPreviousSearch',
    'onValChange',
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
             panelService,
             range,
             isReloadingPreviousSearch,
             onValChange) {

        const ctrl = this;

        var metadataPanelName = 'gr-panel';

        ctrl.metadataPanelAvailable = panelService.isAvailable(metadataPanelName);
        ctrl.metadataPanelVisible = panelService.isVisible(metadataPanelName);
        ctrl.metadataPanelLocked = panelService.isLocked(metadataPanelName);

        ctrl.toggleLockMetadataPanel = () => {
            if(ctrl.metadataPanelVisible) {
                panelService.toggleLocked(metadataPanelName);
            } else {
                // If panel is not visible, show it (but don't lock) when clicked
                panelService.setVisible(metadataPanelName, false);
            }
        }
        ctrl.showMetadataPanelMouseOver = () => panelService.setVisible(metadataPanelName);
        ctrl.showMetadataPanelMouseLeave = () => panelService.setInvisible(metadataPanelName);

        $rootScope.$on(
            'ui:panels:' + metadataPanelName + ':availability-updated',
            () => ctrl.metadataPanelAvailable = panelService.isAvailable(metadataPanelName)
        );

        $rootScope.$on(
            'ui:panels:' + metadataPanelName + ':visibility-updated',
            () => ctrl.metadataPanelVisible = panelService.isVisible(metadataPanelName)
        );

        $rootScope.$on(
            'ui:panels:' + metadataPanelName + ':lock-updated',
            () => ctrl.metadataPanelLocked = panelService.isLocked(metadataPanelName)
        );

        ctrl.images = [];
        ctrl.newImagesCount = 0;

        // FIXME: This is being refreshed by the router.
        // Make it watch a $stateParams collection instead
        // See:   https://github.com/guardian/media-service/pull/64#discussion-diff-17351746L116
        ctrl.loading = true;

        ctrl.revealNewImages = revealNewImages;

        ctrl.getLastSeenVal = getLastSeenVal;
        ctrl.imageHasBeenSeen = imageHasBeenSeen;

        ctrl.filter = { orderBy: $stateParams.orderBy };

        // Arbitrary limit of number of results; too many and the
        // scrollbar becomes hyper-sensitive
        const searchFilteredLimit = 5000;
        // When reviewing all images, we accept a degraded scroll
        // experience to allow seeing around one day's worth of images
        const searchAllLimit = 20000;
        ctrl.maxResults = $stateParams.query ? searchFilteredLimit : searchAllLimit;

        // If not reloading a previous search, discard any previous
        // state related to the last search
        if (! isReloadingPreviousSearch) {
            lastSearchFirstResultTime = undefined;
        }

        // TODO: avoid this initial search (two API calls to init!)
        ctrl.searched = search({length: 1}).then(function(images) {
            ctrl.totalResults = images.total;

            // images will be the array of loaded images, used for display
            ctrl.images = [];

            // imagesAll will be a sparse array of all the results
            ctrl.imagesAll = [];
            ctrl.imagesAll.length = Math.min(images.total, ctrl.maxResults);

            checkForNewImages();

            // Keep track of time of the latest result for all
            // subsequent searches (so we always query the same set of
            // results), unless we're reloading a previous search in
            // which case we reuse the previous time too

            // FIXME: the resolution of uploadTime is seconds, which could
            // not be enough to avoid multiple images sharing an
            // uploadTime and issues with duplicate results in the
            // queried set
            const latestTime = images.data[0] && images.data[0].data.uploadTime;
            if (latestTime && ! isReloadingPreviousSearch) {
                lastSearchFirstResultTime = latestTime;
            }
        }).finally(() => {
            ctrl.loading = false;
        });


        ctrl.loadRange = function(start, end) {
            const length = end - start + 1;
            search({offset: start, length: length}).then(images => {
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

        const pollingPeriod = 15 * 1000; // ms

        // FIXME: this will only add up to 50 images (search capped)
        function checkForNewImages() {
            $timeout(() => {
                const latestTime = lastSearchFirstResultTime;
                // Blank any 'until' parameter to look for new images
                // TODO: if a manual until was set (e.g. using date
                // picker), don't check for new images until now
                search({since: latestTime, length: 0, until: null}).then(resp => {
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

            // Default explicit until/since to $stateParams
            if (angular.isUndefined(until)) {
                if (angular.isUndefined($stateParams.orderBy)) {
                    until = $stateParams.until || lastSearchFirstResultTime;
                }
                else {
                    until = $stateParams.until;
                }
            }
            if (angular.isUndefined(since)) {
                if (angular.isDefined($stateParams.orderBy)) {
                    since = $stateParams.since || lastSearchFirstResultTime;
                }
                else {
                    since = $stateParams.since;
                }
            }

            return mediaApi.search($stateParams.query, angular.extend({
                ids:        $stateParams.ids,
                archived:   $stateParams.archived,
                // The nonFree state param is the inverse of the free API param
                free:       $stateParams.nonFree === 'true' ? undefined: true,
                uploadedBy: $stateParams.uploadedBy,
                until:      until,
                since:      since,
                offset:     offset,
                length:     length,
                orderBy:    $stateParams.orderBy
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

        const freeUpdateListener = $rootScope.$on('image-updated', (e, updatedImage, oldImage) => {
            var index = ctrl.images.findIndex(i => i.data.id === updatedImage.data.id);
            if (index !== -1) {
                ctrl.images[index] = updatedImage;

                // FIXME: does this really belong here?
                if (ctrl.selectedImages.has(oldImage)) {
                    selection.remove(oldImage);
                    selection.add(updatedImage);
                }
            }

            var indexAll = ctrl.imagesAll.findIndex(i => i && i.data.id === updatedImage.data.id);
            if (indexAll !== -1) {
                ctrl.imagesAll[indexAll] = updatedImage;
            }
        });

        $scope.$watch(() => ctrl.filter.orderBy, onValChange(newVal => {
            $state.go('search.results', {orderBy: newVal});
        }));

        // Safer than clearing the timeout in case of race conditions
        // FIXME: nicer (reactive?) way to do this?
        var scopeGone = false;

        $scope.$on('$destroy', () => {
            scrollPosition.save($stateParams);
            freeUpdateListener();
            selection.clear();
            scopeGone = true;
        });
    }
]);
