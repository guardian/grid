import angular from 'angular';
import Rx from 'rx';
import * as querySyntax from '../search-query/query-syntax';

import '../services/panel';
import '../util/async';
import '../util/rx';
import '../util/seq';
import '../components/gu-lazy-table/gu-lazy-table';
import '../downloader/downloader';
import '../components/gr-delete-image/gr-delete-image';

export var results = angular.module('kahuna.search.results', [
    'kahuna.services.panel',
    'util.async',
    'util.rx',
    'util.seq',
    'gu.lazyTable',
    'gr.downloader',
    'gr.deleteImage'
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
    '$log',
    '$q',
    'inject$',
    'subscribe$',
    'delay',
    'onNextEvent',
    'mediaApi',
    'selection',
    'selectedImages$',
    'results',
    'panelService',
    'range',
    'isReloadingPreviousSearch',
    'search',
    function($rootScope,
             $scope,
             $state,
             $stateParams,
             $window,
             $timeout,
             $log,
             $q,
             inject$,
             subscribe$,
             delay,
             onNextEvent,
             mediaApi,
             selection,
             selectedImages$,
             results,
             panelService,
             range,
             isReloadingPreviousSearch,
             Search) {

        const ctrl = this;

        var metadataPanelName = 'gr-panel';

        ctrl.metadataPanelAvailable = panelService.isAvailable(metadataPanelName);
        ctrl.metadataPanelVisible = panelService.isVisible(metadataPanelName);
        ctrl.metadataPanelLocked = panelService.isLocked(metadataPanelName);

        ctrl.toggleLockMetadataPanel = () => {
            if (ctrl.metadataPanelVisible) {
                panelService.toggleLocked(metadataPanelName);
            } else {
                // If panel is not visible, show it (but don't lock) when clicked
                panelService.show(metadataPanelName, false);
            }
        };

        ctrl.showMetadataPanelMouseOver = () => panelService.show(metadataPanelName);
        ctrl.showMetadataPanelMouseLeave = () => panelService.hide(metadataPanelName);

        $rootScope.$on(
            'ui:panels:' + metadataPanelName + ':updated',
            () => {
                ctrl.metadataPanelAvailable = panelService.isAvailable(metadataPanelName);
                ctrl.metadataPanelVisible = panelService.isVisible(metadataPanelName);
                ctrl.metadataPanelLocked = panelService.isLocked(metadataPanelName);
            }
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

        // Map to track image->position and help remove duplicates
        const imagesPositions = new Map();

        const sparseArray = len => {
            const a = [];
            a.length = len;
            return a;
        };
        // the startWith is here as there is a race condistion where the loadRange can complete
        // before the initial search.
        // TODO: we don't actually wait for the initial search to resolve in the router.
        const imagesAll$ = Search.total$.map(sparseArray).startWith([]);
        const loading$ = Search.total$.map(() => false);
        inject$($scope, Search.total$, ctrl, 'totalResults');
        inject$($scope, imagesAll$, ctrl, 'imagesAll');
        inject$($scope, loading$, ctrl, 'loading');

        // related labels
        const relatedLabelsPromise$ = Search.results$.flatMap(images =>
            Rx.Observable
                .fromPromise(images.follow('related-labels').get())
                .catch(err => err.message === 'No link found for rel: related-labels' ?
                    Rx.Observable.empty() : Rx.Observable.throw(err)
                )
        );

        const relatedLabels$ = relatedLabelsPromise$.map(labels =>
            labels.data.siblings).startWith([]);

        const parentLabel$ = relatedLabelsPromise$.map(labels => labels.data.label);

        inject$($scope, relatedLabels$, ctrl, 'relatedLabels');
        inject$($scope, parentLabel$, ctrl, 'parentLabel');

        ctrl.switchSuggestedLabelTo = label => {
            const q = $stateParams.query;
            const removedLabelsQ = querySyntax.removeLabels(q, ctrl.relatedLabels);
            const query = querySyntax.addLabel(removedLabelsQ, label.name);
            setQuery(query);
        };

        ctrl.removeSuggestedLabel = label => {
            const query = querySyntax.removeLabel($stateParams.query, label.name);
            setQuery(query);
        };

        ctrl.setParentLabel = () => {
            if (ctrl.parentLabel) {
                const query = querySyntax.addLabel($stateParams.query || '', ctrl.parentLabel);
                setQuery(query);
            }
        };

        function setQuery(query) {
            const newStateParams = angular.extend({}, $stateParams, { query });
            $state.transitionTo($state.current, newStateParams, {
                reload: true, inherit: false, notify: true
            });
        }

        // TODO: reinstate this
        //ctrl.suggestedLabelSearch = q =>
        //    ctrl.searched.then(images =>
        //        images.follow('suggested-labels').get({q}).then(labels => labels.data)
        //    ).catch(() => []);

        ctrl.loadRange = function(start, end) {
            const length = end - start + 1;
            search({offset: start, length: length}).then(images => {
                // Update imagesAll with newly loaded images
                images.data.forEach((image, index) => {
                    const position = index + start;
                    const imageId = image.data.id;

                    // If image already present in results at a
                    // different position (result set shifted due to
                    // items being spliced in or deleted?), get rid of
                    // item at its previous position to avoid
                    // duplicates
                    const existingPosition = imagesPositions.get(imageId);
                    if (angular.isDefined(existingPosition) &&
                        existingPosition !== position) {
                        $log.info(`Detected duplicate image ${imageId}, ` +
                                  `old ${existingPosition}, new ${position}`);
                        delete ctrl.imagesAll[existingPosition];
                        results.set(existingPosition, undefined);
                    }

                    ctrl.imagesAll[position] = image;
                    imagesPositions.set(imageId, position);

                    results.set(position, image);
                });

                // images should not contain any 'holes'
                ctrl.images = compact(ctrl.imagesAll);
            });
        };

        const pollingPeriod = 15 * 1000; // ms

        // FIXME: this will only add up to 50 images (search capped)
        function checkForNewImages() {
            $timeout(() => {
                // Use explicit `until`, or blank it to find new images
                const until = $stateParams.until || null;
                const latestTime = lastSearchFirstResultTime;

                search({since: latestTime, length: 0, until}).then(resp => {
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

        function search({until, since, offset, length, orderBy} = {}) {
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
                // The nonFree state param is the inverse of the free API param
                free:       $stateParams.nonFree === 'true' ? undefined: true,
                uploadedBy: $stateParams.uploadedBy,
                until:      until,
                since:      since,
                offset:     offset,
                length:     length,
                orderBy:    orderBy
            }));
        }

        ctrl.clearSelection = () => {
            panelService.hide(metadataPanelName, false);
            panelService.unavailable(metadataPanelName, false);

            selection.clear();
        };

        const inSelectionMode$ = selection.isEmpty$.map(isEmpty => ! isEmpty);
        inject$($scope, inSelectionMode$, ctrl, 'inSelectionMode');
        inject$($scope, selection.count$, ctrl, 'selectionCount');
        inject$($scope, selection.items$, ctrl, 'selectedItems');


        function canBeDeleted(image) {
            return image.getAction('delete').then(angular.isDefined);
        }
        // TODO: move to helper?
        const selectionIsDeletable$ = selectedImages$.flatMap(selectedImages => {
            const allDeletablePromise = $q.
                all(selectedImages.map(canBeDeleted).toArray()).
                then(allDeletable => allDeletable.every(v => v === true));
            return Rx.Observable.fromPromise(allDeletablePromise);
        });

        inject$($scope, selectedImages$,       ctrl, 'selectedImages');
        inject$($scope, selectionIsDeletable$, ctrl, 'selectionIsDeletable');

        // TODO: avoid expensive watch expressions and let stream push
        // selected status to each image instead?
        ctrl.imageHasBeenSelected = (image) => ctrl.selectedItems.has(image.uri);

        const toggleSelection = (image) => selection.toggle(image.uri);

        ctrl.select = (image) => {
            selection.add(image.uri);
            $window.getSelection().removeAllRanges();
        };

        ctrl.deselect = (image) => {
            selection.remove(image.uri);
            $window.getSelection().removeAllRanges();
        };

        ctrl.onImageClick = function (image, $event) {
            if (ctrl.inSelectionMode) {
                // TODO: prevent text selection?
                if ($event.shiftKey) {
                    var lastSelectedUri = ctrl.selectedItems.last();
                    var lastSelectedIndex = ctrl.images.findIndex(image => {
                        return image.uri === lastSelectedUri;
                    });

                    var imageIndex = ctrl.images.indexOf(image);

                    if (imageIndex === lastSelectedIndex) {
                        toggleSelection(image);
                        return;
                    }

                    var start = imageIndex > lastSelectedIndex ?
                        lastSelectedIndex : imageIndex;

                    var end = imageIndex > lastSelectedIndex ?
                        imageIndex : lastSelectedIndex;

                    for (let i of range(start, end)) {
                        ctrl.select(ctrl.images[i]);
                    }
                }
                else {
                    $window.getSelection().removeAllRanges();
                    toggleSelection(image);
                }
            }
        };

        const freeUpdateListener = $rootScope.$on('image-updated', (e, updatedImage) => {
            var index = ctrl.images.findIndex(i => i.data.id === updatedImage.data.id);
            if (index !== -1) {
                ctrl.images[index] = updatedImage;
            }

            var indexAll = ctrl.imagesAll.findIndex(i => i && i.data.id === updatedImage.data.id);
            if (indexAll !== -1) {
                ctrl.imagesAll[indexAll] = updatedImage;

                // TODO: should not be needed here, the results list
                // should listen to these events and update itself
                // outside of any controller.
                results.set(indexAll, updatedImage);
            }
        });

        const updateImageArray = (images, image) => {
            const index = images.findIndex(i => image.data.id === i.data.id);

            if (index > -1){
                images.splice(index, 1);
            }
        };

        const updatePositions = (image) => {
            // an image has been deleted, so update the imagePositions map, by
            // decrementing the value of all images after the one deleted.
            var positionIndex = imagesPositions.get(image.data.id);

            imagesPositions.delete(image.data.id);

            imagesPositions.forEach((value, key) => {
                if (value > positionIndex) {
                    imagesPositions.set(key, value - 1);
                }
            });
        };

        const freeImageDeleteListener = $rootScope.$on('images-deleted', (e, images) => {
            images.forEach(image => {
                // TODO: should not be needed here, the selection and
                // results should listen to these events and update
                // itself outside of any controller
                ctrl.deselect(image);

                const indexAll = ctrl.imagesAll.findIndex(i => image.data.id === i.data.id);
                results.removeAt(indexAll);

                updateImageArray(ctrl.images, image);
                updateImageArray(ctrl.imagesAll, image);

                updatePositions(image);

                ctrl.totalResults--;
            });
        });

        // Safer than clearing the timeout in case of race conditions
        // FIXME: nicer (reactive?) way to do this?
        var scopeGone = false;

        $scope.$on('$destroy', () => {
            freeUpdateListener();
            freeImageDeleteListener();
            scopeGone = true;
        });
    }
]);
