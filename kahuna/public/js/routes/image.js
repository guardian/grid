import angular from 'angular';

import imageTemplate from '../image/view.html!text';
import cropTemplate  from '../crop/view.html!text';

import '../image/controller';
import '../crop/controller';

// TODO: Figure out how we deal with these dependencies
// They should probably be deps of the controllers
import '../components/gr-top-bar/gr-top-bar';
import '../query/query-filter';
import '../imgops/service';
import '../forms/gr-xeditable/gr-xeditable';

export const imageRoute = angular.module('gr.routes.image', [
    'kahuna.image.controller',
    'kahuna.crop.controller',
    'kahuna.search.filters.query',
    'kahuna.imgops',
    'gr.topBar',
    'grXeditable'
]);

imageRoute.config(['$stateProvider', function($stateProvider) {
    $stateProvider.state('search.results.image', {
        abstract: true,
        url: 'images/:imageId',
        template: `
            <ui-view name="imageInfo"></ui-view>
            <ui-view name="crop"></ui-view>
        `,
        resolve: {
            imageId: ['$stateParams', $stateParams => $stateParams.imageId],
            cropKey: ['$stateParams', $stateParams => $stateParams.crop],
            image:   ['$state', '$q', 'mediaApi', 'imageId',
                    ($state, $q, mediaApi, imageId) => {
                return mediaApi.find(imageId).catch(error => {
                    if (error && error.status === 404) {
                        $state.go('image-error', {message: 'Image not found'});
                    } else {
                        return $q.reject(error);
                    }
                });
            }],

            optimisedImageUri: ['image', 'imgops', (image, imgops) => imgops.getUri(image)]
        }
    }).
    state('search.results.image.info', {
        url: '',
        data: {
            title: () => 'image',
            isOverlay: true
        },
        views: {
            imageInfo: {
                template: imageTemplate,
                controller: 'ImageCtrl',
                controllerAs: 'ctrl'
            }
        }
    }).
    state('search.results.image.crop', {
        url: '/crop',
        data: {
            title: () => 'crop',
            isOverlay: true
        },
        views: {
            crop: {
                template: cropTemplate,
                controller: 'ImageCropCtrl',
                controllerAs: 'ctrl'
            }
        }
    });
}]);
