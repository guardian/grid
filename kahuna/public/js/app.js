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
        controller: 'ImageCropCtrl'
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
        $scope.images = images.filter(freeImageFilter);
        $timeout(function() {
            if ($scope.hasSpace) {
                addImages();
            }
        });
    });

    function freeImageFilter(image) {
       return $stateParams.free === 'false' || image.data.cost === 'free';
    }

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
                $scope.images = $scope.images.concat(newImages).filter(freeImageFilter);
            });
        }
    }

    $scope.$watch('hitBottom', function(hitBottom) {
        if (hitBottom) {
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

}]);

kahuna.controller('ImageCropCtrl',
                  ['$scope', '$stateParams', 'mediaApi', 'mediaCropper',
                   function($scope, $stateParams, mediaApi, mediaCropper) {

    var imageId = $stateParams.imageId;

    mediaApi.find(imageId).then(function(image) {
        $scope.image = image;
    });

    // Standard ratios
    $scope.landscapeRatio = 5 / 3;
    $scope.portraitRatio = 2 / 3;
    $scope.freeRatio = null;

    $scope.aspect = $scope.landscapeRatio;
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
        mediaCropper.createCrop($scope.image, coords).then(function(resp) {
            console.log("crop", resp)
        });
    };

}]);

// Take an image and return a drag data map of mime-type -> value
kahuna.filter('asDragData', function() {
    return function(image) {
        var url = image && image.uri;
        if (url) {
            return {
                'text/plain':    url,
                'text/uri-list': url
            };
        }
    };
});

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

kahuna.directive('uiHitBottom', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.bind('scroll', function(e) {
                // TODO: debounce + defer
                var bottomPos = element[0].scrollTop + element[0].clientHeight;
                var viewHeight = element[0].scrollHeight;
                scope.$apply(function() {
                    scope[attrs.uiHitBottom] = bottomPos === viewHeight;
                });
            });
        }
    };
});

kahuna.directive('uiDragData', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.bind('dragstart', function(e) {
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

angular.bootstrap(document, ['kahuna']);
