import angular from 'angular';

export var results = angular.module('kahuna.search.results', []);

// TODO: use Ctrl as ctrl syntax
results.controller('SearchResultsCtrl',
                  ['$scope', '$state', '$stateParams', '$window', '$timeout', 'mediaApi',
                   function($scope, $state, $stateParams, $window, $timeout, mediaApi) {

    $scope.images = [];

    // FIXME: This is being refreshed by the router. Make it watch a $stateParams collection instead
    // See:   https://github.com/guardian/media-service/pull/64#discussion-diff-17351746L116
    $scope.loading = true;

    $scope.searched = search({since: $stateParams.since}).then(function(images) {
        $scope.totalResults = images.total;
        $scope.images = images.data;
        // yield so images render before we check if there's more space
        $timeout(function() {
            if ($scope.hasSpace) {
                addImages();
            }
        });

        checkForNewImages();
    }).finally(() => {
        $scope.loading = false;
    });

    // Safer than clearing the timeout in case of race conditions
    // FIXME: nicer (reactive?) way to do this?
    var scopeGone = false;
    $scope.$on('$destroy', () => {
        scopeGone = true;
    });


    var pollingPeriod = 5 * 1000; // ms
    $scope.newImagesCount = 0;

    // FIXME: this will only add up to 50 images (search capped)
    function checkForNewImages() {
        $timeout(() => {
            var latestTime = $scope.images[0] && $scope.images[0].data.uploadTime;
            search({since: latestTime}).then(resp => {
                // FIXME: minor assumption that only the latest
                // displayed image is matching the uploadTime
                $scope.newImagesCount = resp.total - 1;

                if (! scopeGone) {
                    checkForNewImages();
                }
            });
        }, pollingPeriod);
    }

    $scope.revealNewImages = function() {
        // FIXME: should ideally be able to just call $state.reload(),
        // but there seems to be a bug (alluded to in the docs) when
        // notify is false, so forcing to true explicitly instead:
        $state.transitionTo($state.current, $stateParams, {
            reload: true, inherit: false, notify: true
        });
    };


    var seenSince;
    var lastSeenKey = 'search.seenFrom';
    $scope.getLastSeenVal = function(image) {
        var key = getQueryKey();
        var val = {};
        val[key] = image.data.uploadTime;

        return val;
    };

    $scope.imageHasBeenSeen = function(image) {
        return image.data.uploadTime <= seenSince;
    };

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

    function addImages() {
        // TODO: stop once reached the end
        var lastImage = $scope.images.slice(-1)[0];
        if (lastImage) {
            var until = lastImage.data.uploadTime;
            return search({until: until, since: $stateParams.since}).then(function(moreImages) {
                // Filter out duplicates (esp. on exact same 'until' date)
                var newImages = excludingCurrentImages(moreImages.data);
                $scope.images = $scope.images.concat(newImages);
            });
        }
    }

    function search({until, since} = {}) {
        // FIXME: Think of a way to not have to add a param in a million places to add it
        return mediaApi.search($stateParams.query, angular.extend({
            ids:        $stateParams.ids,
            since:      $stateParams.since,
            archived:   $stateParams.archived,
            // The nonFree state param is the inverse of the free API param
            free:       $stateParams.nonFree === 'true' ? undefined: true,
            // Search for valid only by default
            valid:      $stateParams.valid === undefined ? true : $stateParams.valid,
            uploadedBy: $stateParams.uploadedBy
        }, {
            until: until,
            since: since
        }));
    }

    function excludingCurrentImages(otherImages) {
        return otherImages.filter(function(image) {
            return $scope.images.filter(function(existing) {
                // TODO: revert back to using uri
                return existing.data.id === image.data.id;
            }).length === 0;
        });
    }

    $scope.whenNearBottom = addImages;
}]);
