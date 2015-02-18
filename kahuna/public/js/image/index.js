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
            image: ['mediaApi', 'imageId',
                    (mediaApi, imageId) => {
                return mediaApi.find(imageId);
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

image.run(['$rootScope', '$state',
           ($rootScope, $state) => {

    $rootScope.$on('$stateChangeError',
                   function(event, toState, toParams, fromState, fromParams, error) {
        if (toState.name === 'image' && error && error.status === 404) {
            $state.go('image-not-found', {message: "Image not found"});
        }
    });

}]);
