import angular from 'angular';
import Rx from 'rx';
import moment from 'moment';

import '../services/scroll-position';
import '../services/panel';
import '../util/async';
import '../util/rx';
import '../util/seq';
import '../util/constants/sendToCapture-config';
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
import '../components/gr-confirmation-modal/gr-confirmation-modal';
import {
  INVALIDIMAGES,
  sendToCaptureAllValid, sendToCaptureCancelBtnTxt, sendToCaptureConfirmBtnTxt, sendToCaptureInvalid,
  sendToCaptureSuccess, sendToCaptureFailure, announcementId,
  sendToCaptureMixed,
  sendToCaptureTitle,
  VALIDIMAGES
} from "../util/constants/sendToCapture-config";

export var results = angular.module('kahuna.search.results', [
    'kahuna.services.scroll-position',
    'kahuna.services.panel',
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
    'gr.toggleButton',
    'gr.confirmationModal'
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
    'delay',
    'onNextEvent',
    'scrollPosition',
    'mediaApi',
    'selection',
    'selectedImages$',
    'results',
    'panels',
    'isReloadingPreviousSearch',
    'globalErrors',

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
             mediaApi,
             selection,
             selectedImages$,
             results,
             panels,
             isReloadingPreviousSearch,
             globalErrors) {

        const ctrl = this;

        ctrl.$onInit = () => {
          ctrl.showSendToPhotoSales = () => $window._clientConfig.showSendToPhotoSales;
        };

        // Panel control
        ctrl.metadataPanel    = panels.metadataPanel;
        ctrl.collectionsPanel = panels.collectionsPanel;

        ctrl.images = [];
        if (ctrl.image && ctrl.image.data.softDeletedMetadata !== undefined) { ctrl.isDeleted = true; }
        ctrl.newImagesCount = 0;
        ctrl.newImagesLastCheckedMoment = moment();

        // Preview control
        ctrl.previewView = false;

        // Map to track image->position and help remove duplicates
        let imagesPositions;

        // FIXME: This is being refreshed by the router.
        // Make it watch a $stateParams collection instead
        // See:   https://github.com/guardian/media-service/pull/64#discussion-diff-17351746L116
        ctrl.loading = true;

        ctrl.revealNewImages = revealNewImages;
        ctrl.applyOrgOwnedFilter = applyOrgOwnedFilter;

        ctrl.getLastSeenVal = getLastSeenVal;
        ctrl.imageHasBeenSeen = imageHasBeenSeen;

        // large limit, but still a limit to ensure users don't reach unusable levels of performance
        ctrl.maxResults = 100000;

        // If not reloading a previous search, discard any previous
        // state related to the last search
        if (! isReloadingPreviousSearch) {
            lastSearchFirstResultTime = undefined;
        }

        // Initial search to find upper `until` boundary of result set
        // (i.e. the uploadTime of the newest result in the set)

        // TODO: avoid this initial search (two API calls to init!)
        ctrl.searched = search({length: 1, orderBy: 'newest'}).then(function(images) {
            ctrl.totalResults = images.total;
          // FIXME: https://github.com/argo-rest/theseus has forced us to co-opt the actions field for this
            ctrl.orgOwnedCount = images.$response?.$$state?.value?.actions;

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
                lastSearchFirstResultTime = latestTime;
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
            search({offset: start, length: length, countAll: false}).then(images => {
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
                const latestTime = lastSearchFirstResultTime;

                search({since: latestTime, length: 0, until}).then(resp => {
                    // FIXME: minor assumption that only the latest
                    // displayed image is matching the uploadTime
                    ctrl.newImagesCount = resp.total;
                    // FIXME: https://github.com/argo-rest/theseus has forced us to co-opt the actions field for this
                    ctrl.newOrgOwnedCount = resp.$response?.$$state?.value?.actions;

                    if (ctrl.newImagesCount > 0) {
                        $rootScope.$emit('events:new-images', { count: ctrl.newImagesCount});
                    }

                    ctrl.lastestTimeMoment = moment(latestTime);
                    ctrl.newImagesLastCheckedMoment = moment();

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
            $window.scrollTo(0,0);
            $state.transitionTo($state.current, $stateParams, {
                reload: true, inherit: false, notify: true
            });
        }

        ctrl.maybeOrgOwnedValue = window._clientConfig.maybeOrgOwnedValue;
        const isOrgOwnedClause = `is:${ctrl.maybeOrgOwnedValue}`;
        function applyOrgOwnedFilter() {
          $window.scrollTo(0,0);
          const toParams = $stateParams.query?.includes(isOrgOwnedClause)
              ? $stateParams
              : {
                  ...$stateParams,
                  query: $stateParams.query
                    ? `${$stateParams.query} ${isOrgOwnedClause}`
                    : isOrgOwnedClause
              };
          $state.transitionTo(
            $state.current,
            toParams,
            { reload: true, inherit: false, notify: true }
          );
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

        function search({until, since, offset, length, orderBy, countAll} = {}) {
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
            if (angular.isUndefined(countAll)) {
              countAll = true;
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
                syndicationStatus: $stateParams.syndicationStatus,
                persisted: $stateParams.persisted,
                countAll
            }));
        }

        ctrl.clearSelection = () => {
            selection.clear();
        };

        ctrl.shareSelection = () => {
            const sharedImagesIds = ctrl.selectedImages.map(image => image.data.id);
            const sharedUrl = $window._clientConfig.rootUri + "/search?nonFree=true&ids=" + sharedImagesIds.join(',');
            navigator.clipboard.writeText(sharedUrl);
            globalErrors.trigger('clipboard', sharedUrl);
        };

      const validatePhotoSalesSelection = (images) => {
        let validImages = [];
        let invalidImages = [];
        images.forEach( (image) => {
          if (image.data.uploadedBy === "Capture_AutoIngest") {
            invalidImages.push(image);
          } else {
            if (image.data.usages.data.length === 0) {
              validImages.push(image);
            } else {
              let syndicationExists = false;
              for (const usage of image.data.usages.data) {
                if (usage.data.platform === "syndication") {
                  syndicationExists = true;
                  break;
                }
              }
              (syndicationExists === true ? invalidImages : validImages).push(image);
            }
          }
        });
        return [validImages, invalidImages];
      };

      ctrl.showPaid = undefined;
      mediaApi.getSession().then(session => {
        ctrl.showPaid = session.user.permissions.showPaid ? session.user.permissions.showPaid : undefined;
      });

      ctrl.sendToPhotoSales = () => {
        try {
          const validImages = validatePhotoSalesSelection(ctrl.selectedImages)[0];
          validImages.map(image => {
            mediaApi.syndicateImage(image.data.id, "Capture", "true");
          });
          ctrl.clearSelection();
          const notificationEvent = new CustomEvent("newNotification", {
            detail: {
              announceId: announcementId,
              description: sendToCaptureSuccess,
              category: "success",
              lifespan: "transient"
            },
            bubbles: true
          });
          window.dispatchEvent(notificationEvent);
        } catch (err) {
          console.log(err);
          const notificationEvent = new CustomEvent("newNotification", {
            detail: {
              announceId: announcementId,
              description: sendToCaptureFailure,
              category: "error",
              lifespan: "transient"
            },
            bubbles: true
          });
          window.dispatchEvent(notificationEvent);
        }
      };

      ctrl.displayConfirmationModal = () => {

        const [validImages, invalidImages] = validatePhotoSalesSelection(ctrl.selectedImages);
        const title = sendToCaptureTitle;
        let eventType;
        let detailObj;

        if (validImages.length !== 0 && invalidImages.length === 0) {
          // All images selected are valid
          eventType = "displayModal";
          detailObj = {
            title: title,
            message: sendToCaptureAllValid,
            cancelBtnTxt: sendToCaptureCancelBtnTxt,
            confirmBtnTxt: sendToCaptureConfirmBtnTxt,
            okayFn: ctrl.sendToPhotoSales
          };

        } else if (validImages.length !== 0 && invalidImages.length !== 0) {
          // Some valid images, some invalid images selected
          eventType = "displayModal";
          detailObj = {
            title: title,
            message: sendToCaptureMixed.replace(VALIDIMAGES, validImages.length.toString()).replace(INVALIDIMAGES, invalidImages.length.toString()),
            cancelBtnTxt: sendToCaptureCancelBtnTxt,
            confirmBtnTxt: sendToCaptureConfirmBtnTxt,
            okayFn: ctrl.sendToPhotoSales
          };

        } else if (validImages.length === 0 && invalidImages.length !== 0) {
          // No valid images selected
          eventType = "newNotification";
          detailObj = {
            announceId: announcementId,
            description: sendToCaptureInvalid,
            category: "warning",
            lifespan: "transient"
          };
        }

        const customEvent = new CustomEvent(eventType, {
          detail: detailObj,
          bubbles: true
        });
        window.dispatchEvent(customEvent);
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
            // only save scroll position if we're destroying grid scope (avoids issue regarding ng-if triggering scope refresh)
            if (0 < $scope.ctrl.images.length) {
              scrollPosition.save($stateParams);
            }
            freeUpdatesListener();
            freeImageDeleteListener();
            scopeGone = true;
        });
    }
]);
