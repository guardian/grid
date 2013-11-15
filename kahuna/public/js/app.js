// TODO: Grunt: compile almond + app
// TODO: Grunt: hash dependencies? or ETag?
// TODO: Load templates using AMD so they can be compiled in

require.config({
    baseUrl: '/assets',
    paths: {
        'angular':       'bower_components/angular/angular.min',
        'angular-route': 'bower_components/angular-route/angular-route.min'
    },
    shim: {
        'angular': {exports: 'angular'},
        'angular-route': ['angular']
    }
});

require([
    'angular',
    'angular-route'
], function(
    angular,
    angularRoute
) {
    var mainScript = document.getElementById('main-script');
    var config = {
        mediaApiUri: mainScript.getAttribute('data-media-api-uri')
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
                    q:     query || '',
                    since: options.since,
                    size:  20
                }
            }).then(function(response) {
                return response.data.hits;
            });
        }

        function find(id) {
            return $http.get(mediaApiUri + '/images/' + id).then(function(response) {
                return response.data;
            });
        }

        function listBuckets() {
            return $http.get(mediaApiUri + '/buckets').then(function(response) {
                return response.data.buckets;
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

    angular.bootstrap(document, ['kahuna']);
});
