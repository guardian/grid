import angular from 'angular';

import './controller';
import '../search/query-filter';
import '../imgops/service';
import '../forms/gr-xeditable/gr-xeditable';
import '../components/gr-top-bar/gr-top-bar';

import imageTemplate from './view.html';
import imageErrorTemplate from './image-error.html';


export var image = angular.module('kahuna.image', [
    'kahuna.image.controller',
    'kahuna.search.filters.query',
    'kahuna.imgops',
    'gr.topBar',
    'grXeditable'
]);


image.config(['$stateProvider',
              function($stateProvider) {

    $stateProvider.state('image', {
        url: '/images/:imageId?crop?cropType&customRatio',
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
                        $state.go('image-error', {message: 'Image not found'});
                    } else {
                        return $q.reject(error);
                    }
                });
            }],

            optimisedImageUri: ['image', 'imgops',
                                (image, imgops) => imgops.getFullScreenUri(image)],
            lowResImageUri: ['image', 'imgops',
                             (image, imgops) => imgops.getLowResUri(image)]
        }
    });

    // Note: we may be able to make this state more generic if we want
    // other error pages
    $stateProvider.state('image-error', {
        params: {message: {}},
        template: imageErrorTemplate,
        controller: ['$scope', 'message', ($scope, message) => {
            $scope.message = message;
        }],
        resolve: {
            message: ['$stateParams', $stateParams => $stateParams.message]
        }
    });
}]);
