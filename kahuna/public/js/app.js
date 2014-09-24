// TODO: Grunt: hash dependencies? or ETag?
// TODO: Load templates using AMD so they can be compiled in

import angular from 'angular';
import 'npm:angular-ui-router';
import 'services/api/media-api';
import 'services/api/media-cropper';
import 'directives/ui-crop-box';

var apiLink = document.querySelector('link[rel="media-api-uri"]');
var config = {
    mediaApiUri: apiLink.getAttribute('href')
};

var kahuna = angular.module('kahuna', [
    'ui.router',
    'kahuna.services.api',
    'kahuna.directives'
]);


// Inject configuration values into the app
angular.forEach(config, function(value, key) {
    kahuna.constant(key, value);
});

kahuna.config(['$locationProvider',
               function($locationProvider) {

    // Use real URLs (with History API) instead of hashbangs
    $locationProvider.html5Mode(true).hashPrefix('!');
}]);

kahuna.config(['$stateProvider', '$urlRouterProvider',
               function($stateProvider, $urlRouterProvider) {

    var templatesDirectory = '/assets/templates';
    $stateProvider.state('search', {
        // Virtual state, we always want to be in a child state of this
        abstract: true,
        url: '/',
        templateUrl: templatesDirectory + '/search.html'
    });
    $stateProvider.state('search.results', {
        url: 'search?query&since&free',
        templateUrl: templatesDirectory + '/search/results.html',
        controller: 'SearchResultsCtrl'
    });
    $stateProvider.state('image', {
        url: '/images/:imageId',
        templateUrl: templatesDirectory + '/image.html',
        controller: 'ImageCtrl'
    });

    $stateProvider.state('crop', {
        url: '/images/:imageId/crop',
        templateUrl: templatesDirectory + '/crop.html',
        controller: 'ImageCropCtrl as imageCropCtrl'
    });

    $urlRouterProvider.otherwise("/search");
}]);


kahuna.controller('SearchQueryCtrl',
                  ['$scope', '$state', '$stateParams',
                   function($scope, $state, $stateParams) {

    // a little annoying as the params are returned as strings
    $scope.free = $stateParams.free !== 'false';
    $scope.query = $stateParams.query || '';
    $scope.since = $stateParams.since || '';

    // Update state from search filters (skip initialisation step)
    $scope.$watch('query', function(query, oldQuery) {
        if (query !== oldQuery) {
            $state.go('search.results', {query: query});
        }
    });
    $scope.$watch('since', function(since, oldSince) {
        if (since !== oldSince) {
            $state.go('search.results', {since: since});
        }
    });
    $scope.$watch('free', function(free, oldFree) {
        if (free !== oldFree) {
            $state.go('search.results', {free: free});
        }
    });

}]);


kahuna.controller('SearchResultsCtrl',
                  ['$scope', '$state', '$stateParams', '$timeout', 'mediaApi',
                   function($scope, $state, $stateParams, $timeout, mediaApi) {

    $scope.images = [];


    // FIXME: This is being refreshed by the router. Make it watch a $stateParams collection instead
    // See:   https://github.com/guardian/media-service/pull/64#discussion-diff-17351746L116
    mediaApi.search($stateParams.query, {
        since: $stateParams.since
    }).then(function(images) {
        $scope.images = images;
        // yield so images render before we check if there's more space
        $timeout(function() {
            if ($scope.hasSpace) {
                addImages();
            }
        });
    });

    $scope.freeImageFilter = function(image) {
       return $stateParams.free === 'false' || image.data.cost === 'free';
    };

    function addImages() {
        // TODO: stop once reached the end
        var lastImage = $scope.images.slice(-1)[0];
        if (lastImage) {
            var until = lastImage.data.uploadTime;
            mediaApi.search($stateParams.query, {
                until: until,
                since: $stateParams.since
            }).then(function(moreImages) {
                // Filter out duplicates (esp. on exact same 'until' date)
                var newImages = moreImages.filter(function(im) {
                    return $scope.images.filter(function(existing) {
                        return existing.uri === im.uri;
                    }).length === 0;
                });
                $scope.images = $scope.images.concat(newImages);

                // FIXME: this is increasingly hacky logic to ensure
                // we bring in more images that satisfy the cost
                // filter

                // If there are more images, just not any matching our cost filter, get moar!
                var filteredImages = newImages.filter($scope.freeImageFilter);
                if (filteredImages.length === 0 && newImages.length > 0) {
                    addImages();
                }
            });
        }
    }

    $scope.$watch('nearBottom', function(nearBottom) {
        if (nearBottom) {
            addImages();
        }
    });
}]);

kahuna.controller('ImageCtrl',
                  ['$scope', '$stateParams', 'mediaApi',
                   function($scope, $stateParams, mediaApi) {

    var imageId = $stateParams.imageId;

    mediaApi.find(imageId).then(function(image) {
        $scope.image = image;
    });

    var ignoredMetadata = ['description', 'source', 'copyright'];
    $scope.isUsefulMetadata = function(metadataKey) {
        return ignoredMetadata.indexOf(metadataKey) === -1;
    };
}]);

kahuna.controller('ImageCropCtrl',
                  ['$scope', '$stateParams', 'mediaApi', 'mediaCropper',
                   function($scope, $stateParams, mediaApi, mediaCropper) {

    var imageId = $stateParams.imageId;

    mediaApi.find(imageId).then(function(image) {
        $scope.image = image;
    });

    $scope.cropping = false;

    // Standard ratios
    $scope.landscapeRatio = 5 / 3;
    $scope.portraitRatio = 2 / 3;
    $scope.freeRatio = null;

    // TODO: migrate the other properties to be on the ctrl (this) instead of $scope
    this.aspect = $scope.landscapeRatio;
    $scope.coords = {
        x1: 0,
        y1: 0,
        // max out to fill the image with the selection
        x2: 10000,
        y2: 10000
    };

    $scope.crop = function() {
        // TODO: show crop
        var coords = {
            x: $scope.coords.x1,
            y: $scope.coords.y1,
            width:  $scope.coords.x2 - $scope.coords.x1,
            height: $scope.coords.y2 - $scope.coords.y1
        };

        var ratio;
        if (Number(this.aspect) === $scope.landscapeRatio) {
            ratio = '5:3';
        } else if (Number(this.aspect) === $scope.portraitRatio) {
            ratio = '3:2';
        }

        $scope.cropping = true;
        mediaCropper.createCrop($scope.image, coords, ratio).then(function(resp) {
            console.log("crop", resp);
            // TODO: navigate to new state, if the data can be passed along
            $scope.crops = resp.data;

            var orderedCrops = $scope.crops.sizings.sort((a, b) => {
                return a.dimensions.width - b.dimensions.width;
            });

            $scope.smallestSizingFile = orderedCrops[0].file;
            // TODO: ideally find best fit based on window size
            $scope.largestSizingFile = orderedCrops.slice(-1)[0].file;

        }).finally(function() {
            $scope.cropping = false;
        });
    }.bind(this);

}]);

// Take an image and return a drag data map of mime-type -> value
kahuna.filter('asImageDragData', function() {
    return function(image) {
        var url = image && image.uri;
        if (url) {
            return {
                'application/vnd.mediaservice.image+json': JSON.stringify(image),
                'text/plain':    url,
                'text/uri-list': url
            };
        }
    };
});

// Take an image and return a drag data map of mime-type -> value
kahuna.filter('asCropsDragData', function() {
    return function(crops) {
        return {
            'application/vnd.mediaservice.crops+json': JSON.stringify(crops)
        };
    };
});

// Take an image and return a drag data map of mime-type -> value
kahuna.filter('asImageAndCropsDragData', ['$filter',
                                          function($filter) {
    var extend = angular.extend;
    return function(image, crops) {
        return extend(
            $filter('asImageDragData')(image),
            $filter('asCropsDragData')(crops));
    };
}]);

kahuna.directive('uiHasSpace', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            scope.$watch(function() {
                scope[attrs.uiHasSpace] = element[0].scrollHeight <= element[0].clientHeight;
            });
        }
    }
});

kahuna.directive('uiNearBottom', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.bind('scroll', function(e) {
                // TODO: debounce + defer
                var bottomPos = element[0].scrollTop + element[0].clientHeight;
                var viewHeight = element[0].scrollHeight;
                var offset = 200;
                scope.$apply(function() {
                    scope[attrs.uiNearBottom] = bottomPos + offset >= viewHeight;
                });
            });
        }
    };
});

kahuna.directive('uiDragData', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.bind('dragstart', function(jqueryEvent) {
                // Unwrap jQuery event wrapper to access dataTransfer
                var e = jqueryEvent.originalEvent;

                // No obvious way to receive an object through an
                // attribute without making this directive an
                // isolate scope...
                var dataMap = JSON.parse(attrs.uiDragData);
                Object.keys(dataMap).forEach(function(mimeType) {
                    e.dataTransfer.setData(mimeType, dataMap[mimeType]);
                });
            });
        }
    };
});

kahuna.directive('uiDragImage', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.bind('dragstart', function(jqueryEvent) {
                // Unwrap jQuery event wrapper to access dataTransfer
                var e = jqueryEvent.originalEvent;
                var img = document.createElement('img');
                img.src = attrs.uiDragImage;
                e.dataTransfer.setDragImage(img, -10, -10);
            });
        }
    };
});

angular.bootstrap(document, ['kahuna']);
