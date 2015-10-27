import angular from 'angular';
import 'angular-ui-router-extras';
import Rx from 'rx';
import Immutable from 'immutable';

import './query';
import './results';
import '../preview/image';
import '../lib/data-structure/list-factory';
import '../lib/data-structure/ordered-set-factory';
import '../components/gr-top-bar/gr-top-bar';
import '../components/gr-panel/gr-panel';

import '../image/controller';

import searchTemplate        from './view.html!text';
import searchResultsTemplate from './results.html!text';
import panelTemplate         from '../components/gr-panel/gr-panel.html!text';
import imageTemplate         from '../image/view.html!text';


export var search = angular.module('kahuna.search', [
    'ct.ui.router.extras.dsr',
    'kahuna.search.query',
    'kahuna.search.results',
    'kahuna.preview.image',
    'kahuna.image.controller',
    'data-structure.list-factory',
    'data-structure.ordered-set-factory',
    'gr.topBar',
    'grPanel'
]);

// TODO: add a resolver here so that if we error (e.g. 401) we don't keep trying
// to render - similar to the image controller see:
// https://github.com/guardian/media-service/pull/478
search.config(['$stateProvider',
               function($stateProvider) {

    $stateProvider.state('search', {
        // FIXME [1]: This state should be abstract, but then we can't navigate to
        // it, which we need to do to access it's deeper / remembered chile state
        url: '/?query&ids&since&nonFree&uploadedBy&until&orderBy',
        template: searchTemplate
    });

    $stateProvider.state('search.results', {
        url: 'search',
        data: {
            title: function(params) {
                return params.query ? params.query : 'search';
            }
        },
        resolve: {
            // Helper state to determine whether this is just
            // reloading a previous search state, or a new search
            isReloadingPreviousSearch: ['$stateParams', function($stateParams) {
                const isDeepStateRedirect = $stateParams.isDeepStateRedirect;
                // *Clear* that transient routing-level flag so we
                // *don't pollute the $stateParams
                delete $stateParams.isDeepStateRedirect;
                return isDeepStateRedirect;
            }],
            selection: ['orderedSetFactory', function(orderedSetFactory) {
                return orderedSetFactory();
            }],
            // equivalent of `ctrl.imagesAll`
            results: ['listFactory', function(listFactory) {
                return listFactory();
            }],
            // equivalent of `ctrl.images`
            compactResults$: ['results', function(results) {
                return results.items$.
                    map(items => items.filter(angular.identity)).
                    shareReplay(1);
            }],
            // set of selected images resources
            selectedImages$: ['selection', 'compactResults$', function(selection, compactResults$) {
                return Rx.Observable.combineLatest(
                    selection.items$,
                    compactResults$,
                    (selectedItems, resultsImages) => {
                        return selectedItems.map(imageUri => {
                            return resultsImages.find(image => image.uri === imageUri);
                        });
                    }
                ).
                    distinctUntilChanged(angular.identity, Immutable.is).
                    shareReplay(1);
            }]
        },
        views: {
            results: {
                template: searchResultsTemplate,
                controller: 'SearchResultsCtrl',
                controllerAs: 'ctrl'
            },
            panel: {
                template: panelTemplate,
                controller: 'GrPanel',
                controllerAs: 'ctrl',
                resolve: {
                    selectedImagesList$: ['selectedImages$', function(selectedImages$) {
                        return selectedImages$.
                            map(selectedImages => selectedImages.toList()).
                            shareReplay(1);
                    }]
                }
            }
        }
    }).
    state('search.results.image', {
        url: '/image/:imageId',
        views: {
            image: {
                template: imageTemplate,
                controller: 'ImageCtrl',
                controllerAs: 'ctrl',
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
            }
        }
    });
}]);

// FIXME: This is here if you go to another state directly e.g. `'/images/id'`
// and then navigate to search. As it has no remembered `deepStateRedirect`,
// we just land on `/`. See [1].
search.run(['$rootScope', '$state', function($rootScope, $state) {
    $rootScope.$on('$stateChangeSuccess', (_, toState) => {
        if (toState.name === 'search') {
            $state.go('search.results', null, {reload: true});
        }
    });
}]);
