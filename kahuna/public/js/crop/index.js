import angular from 'angular';

import './controller';

import cropTemplate from './view.html!text';


export var crop = angular.module('kahuna.crop', [
    'kahuna.crop.controller'
]);


crop.config(['$stateProvider',
             function($stateProvider) {

    $stateProvider.state('crop', {
        url: '/images/:imageId/crop',
        template: cropTemplate,
        controller: 'ImageCropCtrl as imageCropCtrl',
        resolve: {
            // TODO: abstract these resolvers out as we use them on the image
            // view too
            imageId: ['$stateParams', $stateParams => $stateParams.imageId],
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
            optimisedImageUri: ['image', 'imgopts', (image, imgopts) => imgopts.getUri(image)]
        }
    });

}]);
