import angular from 'angular';

import '../services/preview-selection';

export var results = angular.module('kahuna.search.results', ['kahuna.services.selection']);

results.controller('SearchResultsCtrl', [
    '$rootScope',
    '$scope',
    '$state',
    '$stateParams',
    '$window',
    '$timeout',
    'mediaApi',
    'selectionService',
    function($rootScope,
             $scope,
             $state,
             $stateParams,
             $window,
             $timeout,
             mediaApi,
             selection) {

        const ctrl = this;

        ctrl.images = [];
        ctrl.newImagesCount = 0;

        // FIXME: This is being refreshed by the router.
        // Make it watch a $stateParams collection instead
        // See:   https://github.com/guardian/media-service/pull/64#discussion-diff-17351746L116
        ctrl.loading = true;

        ctrl.whenNearBottom = addImages;
        ctrl.fillRemainingSpace = fillRemainingSpace;

        ctrl.revealNewImages = revealNewImages;

        ctrl.getLastSeenVal = getLastSeenVal;
        ctrl.imageHasBeenSeen = imageHasBeenSeen;

        ctrl.searched = search().then(function(images) {
            ctrl.totalResults = images.total;
            ctrl.images = images.data;
            // yield so images render before we check if there's more space
            fillRemainingSpace();
            checkForNewImages();
        }).finally(() => {
            ctrl.loading = false;
        });


        // Safer than clearing the timeout in case of race conditions
        // FIXME: nicer (reactive?) way to do this?
        var scopeGone = false;
        $scope.$on('$destroy', () => {
            scopeGone = true;
        });


        const pollingPeriod = 5 * 1000; // ms

        // FIXME: this will only add up to 50 images (search capped)
        function checkForNewImages() {
            $timeout(() => {
                const latestTime = ctrl.images[0] && ctrl.images[0].data.uploadTime;
                search({since: latestTime}).then(resp => {
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

        $scope.$watch('nearBottom', function(nearBottom) {
            if (nearBottom) {
                addImages();
            }
        });

        function getQueryKey() {
            return $stateParams.query || '*';
        }


        function fillRemainingSpace(){
             $timeout(function() {
                if (ctrl.uiHasSpace) {
                    addImages();
                }
            });
        }

        function addImages() {
            // TODO: stop once reached the end
            const lastImage = ctrl.images.slice(-1)[0];
            if (lastImage) {
                const until = lastImage.data.uploadTime;
                return search({until: until}).then(function(moreImages) {
                    // Filter out duplicates (esp. on exact same 'until' date)
                    var newImages = excludingCurrentImages(moreImages.data);
                    ctrl.images = ctrl.images.concat(newImages);
                });
            }
        }

        function search({until, since} = {}) {
            // FIXME: Think of a way to not have to add a param in a million places to add it
            return mediaApi.search($stateParams.query, angular.extend({
                ids:        $stateParams.ids,
                archived:   $stateParams.archived,
                // The nonFree state param is the inverse of the free API param
                free:       $stateParams.nonFree === 'true' ? undefined: true,
                uploadedBy: $stateParams.uploadedBy,
                // Override $stateParams until/since with any explicitly provided argument
                until:      until || $stateParams.until,
                since:      since || $stateParams.since
            }));
        }

        function excludingCurrentImages(otherImages) {
            return otherImages.filter(function(image) {
                return ctrl.images.filter(function(existing) {
                    // TODO: revert back to using uri
                    return existing.data.id === image.data.id;
                }).length === 0;
            });
        }

        function* range (start, end) {
            for (let i = start; i <= end; i += 1) {
                yield i;
            }
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

                if (ctrl.selectedImages.has(oldImage)) {
                    selection.remove(oldImage);
                    selection.add(updatedImage);
                }
            }
        });

        $scope.$on('$destroy', function() {
            selection.clear();
        });
    }
]);
