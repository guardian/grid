import angular from 'angular';

import './controller';
import '../search/query-filter';

import imageTemplate from './view.html!text';
import imageNotFoundTemplate from './404.html!text';


export var image = angular.module('kahuna.image', [
    'kahuna.image.controller',
    'kahuna.search.filters.query'
]);


image.config(['$stateProvider',
              function($stateProvider) {

    $stateProvider.state('image', {
        url: '/images/:imageId?crop',
        template: imageTemplate,
        controller: 'ImageCtrl',
        controllerAs: 'ctrl',
        resolve: {
            imageId: ['$stateParams', $stateParams => $stateParams.imageId],
            cropKey: ['$stateParams', $stateParams => $stateParams.crop],
            image: ['$state', '$q', 'mediaApi', 'imageId',
                    ($state, $q, mediaApi, imageId) => {

                return mediaApi.find(imageId).catch(error => {
                    if (error && error.status === 404) {
                        $state.go('image-not-found', {message: 'Image not found'});
                    } else {
                        $q.reject(error);
                    }
                });
            }],

            optimisedImageUri: ['$window', '$q', 'image', ($window, $q, image) => {
                var { width: w, height: h } = $window.screen;

                return image.follow('optimised', { w, h, q: 95 }).getUri().catch(error => {
                    return image.source.secureUrl || image.source.file;
                });
            }]
        }
    });

    // Note: we may be able to make this state more generic if we want
    // other error pages
    $stateProvider.state('image-not-found', {
        params: {message: {}},
        template: imageNotFoundTemplate,
        controller: ['$scope', 'message', ($scope, message) => {
            $scope.message = message;
        }],
        resolve: {
            message: ['$stateParams', $stateParams => $stateParams.message]
        }
    });
}]);
