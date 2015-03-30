import angular from 'angular';

import './controller';
import '../search/query-filter';
import '../imgops/service';

import imageTemplate from './view.html!text';
import imageNotFoundTemplate from './404.html!text';


export var image = angular.module('kahuna.image', [
    'kahuna.image.controller',
    'kahuna.search.filters.query',
    'kahuna.imgops'
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
                        return $q.reject(error);
                    }
                });
            }],

            optimisedImageUri: ['image', 'imgops', (image, imgops) => imgops.getUri(image)]
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
