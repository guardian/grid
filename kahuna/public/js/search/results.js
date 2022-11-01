import angular from 'angular';
import Rx from 'rx';
import moment from 'moment';

import '../services/scroll-position';
import '../services/panel';
import '../services/images';
import '../util/async';
import '../util/rx';
import '../util/seq';
import '../components/gu-lazy-table/gu-lazy-table';
import '../components/gu-lazy-preview/gu-lazy-preview';
import '../components/gu-lazy-table-shortcuts/gu-lazy-table-shortcuts';
import '../components/gu-lazy-preview-shortcuts/gu-lazy-preview-shortcuts';
import '../components/gr-archiver/gr-archiver';
import '../components/gr-delete-image/gr-delete-image';
import '../components/gr-undelete-image/gr-un-delete-image';
import '../components/gr-downloader/gr-downloader';
import '../components/gr-batch-export-original-images/gr-batch-export-original-images';
import '../components/gr-panel-button/gr-panel-button';
import '../components/gr-toggle-button/gr-toggle-button';

export var results = angular.module('kahuna.search.results', [
    'kahuna.services.scroll-position',
    'kahuna.services.panel',
    'kahuna.services.images',
    'util.async',
    'util.rx',
    'util.seq',
    'gu.lazyTable',
    'gu.lazyTableShortcuts',
    'gu.lazyPreview',
    'gu.lazyPreviewShortcuts',
    'gr.archiver',
    'gr.downloader',
    'gr.batchExportOriginalImages',
    'gr.deleteImage',
    'gr.undeleteImage',
    'gr.panelButton',
    'gr.toggleButton'
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
    '$log',
    '$q',
    'inject$',
    'delay',
    'onNextEvent',
    'scrollPosition',
    'selection',
    'selectedImages$',
    'results',
    'panels',
    'imagesService',
    'isReloadingPreviousSearch',

    function($rootScope,
             $scope,
             $state,
             $stateParams,
             $window,
             $timeout,
             $log,
             $q,
             inject$,
             delay,
             onNextEvent,
             scrollPosition,
             selection,
             selectedImages$,
             results,
             panels,
             imagesService,
             isReloadingPreviousSearch) {

        const ctrl = this;

        // Panel control
        ctrl.metadataPanel    = panels.metadataPanel;
        ctrl.collectionsPanel = panels.collectionsPanel;

        ctrl.images = [];
        if (ctrl.image && ctrl.image.data.softDeletedMetadata !== undefined) { ctrl.isDeleted = true; }
        ctrl.newImagesCount = 0;

        // Preview control
        ctrl.previewView = false;

        // Map to track image->position and help remove duplicates
        let imagesPositions;

        // FIXME: This is being refreshed by the router.
        // Make it watch a $stateParams collection instead
        // See:   https://github.com/guardian/media-service/pull/64#discussion-diff-17351746L116
        ctrl.loading = true;

        ctrl.revealNewImages = revealNewImages;

        ctrl.getLastSeenVal = getLastSeenVal;
        ctrl.imageHasBeenSeen = imageHasBeenSeen;

        // large limit, but still a limit to ensure users don't reach unusable levels of performance
        ctrl.maxResults = 100000;

        // Initial search to find upper `until` boundary of result set
        // (i.e. the uploadTime of the newest result in the set)

        // TODO: avoid this initial search (two API calls to init!)
        console.log("Searching!");
        imagesService.search($stateParams, {length: 1, orderBy: 'newest'}).then(function(images) {
            ctrl.totalResults = images.total;

            ctrl.hasQuery = !!$stateParams.query;
            ctrl.initialSearchUri = images.uri;
            ctrl.embeddableUrl = window.location.href;

            // images will be the array of loaded images, used for display
            ctrl.images = [];

            // imagesAll will be a sparse array of all the results
            const totalLength = Math.min(images.total, ctrl.maxResults);
            ctrl.imagesAll = [];
            ctrl.imagesAll.length = totalLength;

            // TODO: ultimately we want to manage the state in the
            // results stream exclusively
            results.clear();
            results.resize(totalLength);

            imagesPositions = new Map();

            checkForNewImages();

            // Keep track of time of the latest result for all
            // subsequent searches (so we always query the same set of
            // results), unless we're reloading a previous search in
            // which case we reuse the previous time too

            const until = $stateParams.until || null;
            const latestTime = until || moment().toISOString();

            if (latestTime && ! isReloadingPreviousSearch) {
                // TODO would like to eliminate
                imagesService.setLastSearchFirstResultTime(latestTime);
            }

            return images;
        }).catch(error => {
            ctrl.loadingError = error;
            return $q.reject(error);
        }).finally(() => {
            ctrl.loading = false;
        });

        ctrl.loadRange = function(start, end) {
            const length = end - start + 1;
            console.log('loading range');
            imagesService.search($stateParams, {offset: start, length: length}).then(images => {
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
                // Use explicit `until`, or blank it to find new images
                const until = $stateParams.until || null;
                const latestTime = imagesService.getLastSearchFirstResultTime();

                imagesService.checkForNewImages($stateParams, {since: latestTime, length: 0, until}).then(resp => {
                    // FIXME: minor assumption that only the latest
                    // displayed image is matching the uploadTime
                    ctrl.newImagesCount = resp.total;

                    if (ctrl.newImagesCount > 0) {
                        $rootScope.$emit('events:new-images', { count: ctrl.newImagesCount});
                    }

                    ctrl.lastestTimeMoment = moment(latestTime).from(moment());

                    if (!scopeGone) {
                        checkForNewImages();
                    }
                });
            }, pollingPeriod);
        }

        function revealNewImages() {
            // FIXME: should ideally be able to just call $state.reload(),
            // but there seems to be a bug (alluded to in the docs) when
            // notify is false, so forcing to true explicitly instead:
            $window.scrollTo(0,0);
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

            // Tracking to potentially kill this feature off
            $rootScope.$emit('track:event', 'Mark as seen', 'Clicked', null, null, {image: image});

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

        ctrl.clearSelection = () => {
            selection.clear();
        };

        const inSelectionMode$ = selection.isEmpty$.map(isEmpty => ! isEmpty);
        inject$($scope, inSelectionMode$, ctrl, 'inSelectionMode');
        inject$($scope, selection.count$, ctrl, 'selectionCount');
        inject$($scope, selection.items$, ctrl, 'selectedItems');


        function canBeDeleted(image) {
            if (image && image.data.softDeletedMetadata !== undefined) { ctrl.isDeleted = true; }
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

                    var start = Math.min(imageIndex, lastSelectedIndex);

                    var end = Math.max(imageIndex, lastSelectedIndex) + 1;

                    const imageURIs = ctrl.images
                      .slice(start, end)
                      .map(image => image.uri);
                    selection.union(imageURIs);

                    $window.getSelection().removeAllRanges();
                }
                else {
                    $window.getSelection().removeAllRanges();
                    toggleSelection(image);
                }
            }
        };


      const freeUpdatesListener = $rootScope.$on('images-updated', (e, updatedImages) => {
        updatedImages.map(updatedImage => {
          var index = ctrl.images.findIndex(i => i.data.id === updatedImage.data.id);
          if (index !== -1) {
            ctrl.images[index] = updatedImage;
          }

          var indexAll = ctrl.imagesAll.findIndex(i => i && i.data.id === updatedImage.data.id);
          if (indexAll !== -1) {
            ctrl.imagesAll[indexAll] = updatedImage;
          }
        });

        // TODO: should not be needed here, the results list
        // should listen to these events and update itself
        // outside of any controller.
        results.map(image => {
          if (image == undefined){
            return image;
          }
          const maybeUpdated = updatedImages.find(i => i.data.id === image.data.id);
          if (maybeUpdated !== undefined) {
            return maybeUpdated;
          }
          return image;
        });
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

        ctrl.batchOperations = [];

        ctrl.buildBatchProgressGradient = () => {
            const completed = ctrl.batchOperations
                .map(({ completed }) => completed)
                .reduce((acc, x) => acc + x, 0);

            const total = ctrl.batchOperations
                .map(({ total }) => total)
                .reduce((acc, x) => acc + x, 0);

            const percentage = Math.round(((completed * 1.0) / total) * 100);

            return {
                background:
                    `linear-gradient(90deg, #00adee ${percentage}%, transparent ${percentage}%)`
            };
        };

        $scope.$on("events:batch-operations:start", (e, entry) => {
            ctrl.batchOperations = [entry, ...ctrl.batchOperations];
            if (entry.key === "peopleInImage" && ctrl.batchOperations.length > 1){
              const total = ctrl.batchOperations.reduce((acc, operations) => acc + parseInt(operations.total), 0);
              ctrl.batchOperations = [Object.assign({}, entry, { total })];
            }
            window.onbeforeunload = function() {
                return 'Batch update in progress, are you sure you want to leave?';
            };
        });

        $scope.$on("events:batch-operations:progress", (e, { key, completed }) => {
            ctrl.batchOperations = ctrl.batchOperations.map(entry => {
                if (entry.key === key) {
                    if (entry.key === "peopleInImage") {
                      completed = ctrl.batchOperations[0].completed + 1;
                    }
                    return Object.assign({}, entry, { completed });
                }

                return entry;
            });
        });

        $scope.$on("events:batch-operations:complete", (e, { key }) => {
            if (ctrl.batchOperations[0].key === 'peopleInImage' && ctrl.batchOperations[0].total !== ctrl.batchOperations[0].completed) {
              return;
            }
            else {
              ctrl.batchOperations = ctrl.batchOperations.filter(entry => entry.key !== key);

              if (ctrl.batchOperations.length === 0) {
                  window.onbeforeunload = null;
              }
            }
        });

        $scope.$on('$destroy', () => {
            scrollPosition.save($stateParams);
            freeUpdatesListener();
            freeImageDeleteListener();
            scopeGone = true;
        });
    }
]);
