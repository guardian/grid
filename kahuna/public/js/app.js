// TODO: Grunt: hash dependencies? or ETag?
// TODO: Load templates using AMD so they can be compiled in

import angular from 'angular';
import 'npm:angular-ui-router';

var apiLink = document.querySelector('link[rel="media-api-uri"]');
var config = {
    mediaApiUri: apiLink.getAttribute('href')
};

var kahuna = angular.module('kahuna', [
    'ui.router'
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
        url: '/',
        templateUrl: templatesDirectory + '/search.html',
        controller: 'SearchCtrl'
    });

    $stateProvider.state('image', {
        url: '/images/:imageId',
        templateUrl: templatesDirectory + '/image.html',
        controller: 'ImageCtrl'
    });

    $urlRouterProvider.otherwise("/");
}]);


kahuna.factory('mediaApi',
               ['$http', 'mediaApiUri',
                function($http, mediaApiUri) {

    function search(query, options) {
        options = options || {};

        return $http.get(mediaApiUri + '/images', {
            params: {
                q:      query || '',
                since:  options.since,
                until:  options.until,
                length: 20
            },
            withCredentials: true
        }).then(function(response) {
            return response.data.data;
        });
    }

    function find(id) {
        return $http.get(mediaApiUri + '/images/' + id, { withCredentials: true }).then(function(response) {
            return response.data;
        });
    }

    return {
        search: search,
        find: find
    };
}]);

kahuna.controller('SearchCtrl',
                  ['$scope', 'mediaApi',
                   function($scope, mediaApi) {

    $scope.$watchCollection(function() {
        return {query: $scope.query, since: $scope.since};
    }, function(params) {
        mediaApi.search(params.query, {
            since: params.since
        }).then(function(images) {
            $scope.images = images;
        });
    });

    $scope.since = ''; // default to anytime
    $scope.images = [];

    $scope.$watch('hitBottom', function(hitBottom) {
        if (hitBottom) {
            var lastImage = $scope.images.slice(-1)[0];
            if (lastImage) {
                // TODO: stop once reached the end
                var until = lastImage.data.uploadTime;
                mediaApi.search($scope.query, {
                    until: until,
                    since: $scope.since
                }).then(function(moreImages) {
                    // Filter out duplicates (esp. on exact same 'until' date)
                    var newImages = moreImages.filter(function(im) {
                        return $scope.images.filter(function(existing) {
                            return existing.uri === im.uri;
                        }).length === 0;
                    });
                    $scope.images = $scope.images.concat(newImages);
                });
            }
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

// Take an image and return a drag data map of mime-type -> value
kahuna.filter('asDragData', function() {
    return function(image) {
        var url = image.uri;
        return {
            'text/plain':    url,
            'text/uri-list': url
        };
    };
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
