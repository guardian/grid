// TODO: Grunt: hash dependencies? or ETag?
// TODO: Load templates using AMD so they can be compiled in

import angular from 'angular';
import 'github:angular/bower-angular-route@1.2.23/angular-route';
// TODO: should be able to define the main and just have:
// import angularRoute from 'github:angular/bower-angular-route';

    var apiLink = document.querySelector('link[rel="media-api-uri"]');
    var config = {
        mediaApiUri: apiLink.getAttribute('href')
    };

    var kahuna = angular.module('kahuna', [
        'ngRoute'
    ]);


    // Inject configuration values into the app
    angular.forEach(config, function(value, key) {
        kahuna.constant(key, value);
    });

    kahuna.config(['$locationProvider', '$routeProvider',
                   function($locationProvider, $routeProvider) {

        // Use real URLs (with History API) instead of hashbangs
        $locationProvider.html5Mode(true).hashPrefix('!');


        var templatesDirectory = '/assets/templates';
        $routeProvider.when('/', {
            templateUrl: templatesDirectory + '/search.html',
            controller: 'SearchCtrl'
        });

        $routeProvider.when('/images/:imageId', {
            templateUrl: templatesDirectory + '/image.html',
            controller: 'ImageCtrl'
        });
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

        function listBuckets() {
            return $http.get(mediaApiUri + '/buckets', { withCredentials: true }).then(function(response) {
                return response.data.data;
            });
        }

        return {
            search: search,
            find: find,
            listBuckets: listBuckets
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


        mediaApi.listBuckets().then(function(buckets) {
            $scope.buckets = buckets;
        });

    }]);

    kahuna.controller('ImageCtrl',
                      ['$scope', '$routeParams', 'mediaApi',
                       function($scope, $routeParams, mediaApi) {

        var imageId = $routeParams.imageId;

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
