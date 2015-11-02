import angular from 'angular';
import 'angular-ui-router-extras';
import Rx from 'rx';
import Immutable from 'immutable';

import '../query/query';
import '../results/results';

import searchTemplate        from '../search/view.html!text';
import searchResultsTemplate from '../results/results.html!text';
import panelTemplate         from '../components/gr-panel/gr-panel.html!text';
import searchQueryTemplate   from '../query/query.html!text';

// TODO: do better things with these deps
// TODO: do better things with these deps
import '../preview/image';
import '../lib/data-structure/list-factory';
import '../lib/data-structure/ordered-set-factory';
import '../lib/data-structure/map-factory';
import '../components/gr-panel/gr-panel';
import '../components/gr-top-bar/gr-top-bar';

export const searchRouter = angular.module('gr.routes.search', [
    'kahuna.search.query',
    'kahuna.search.results',
    'kahuna.preview.image',
    'kahuna.image.controller',
    'data-structure.list-factory',
    'data-structure.ordered-set-factory',
    'data-structure.mapFactory',
    'grPanel',
    'gr.topBar'
]);

searchRouter.config(['$stateProvider', function($stateProvider) {
    $stateProvider.state('search', {
        abstract: true,
        url: '/?query&ids&since&nonFree&uploadedBy&until&orderBy',
        template: searchTemplate,
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
            }],
            searchParams: ['$state', '$stateParams', 'mapFactory',
                           function($state, $stateParams, mapFactory) {
                // TODO: Think about restricting these to:
                // ["ids", "archived", "nonFree", "uploadedBy", "until", "since", "offset",
                //  "length", "orderBy", "query"]
                const params = mapFactory();

                // As we want to have the side effect or a URL change happen irrespective of whether
                // we have subscription, we setup a `do` and create a hot observable to do so.
                const stateChange$ = params.map$.do(params => {
                    $state.go('search.results', params.toJS(), { notify: false });
                }).publish();
                stateChange$.connect();

                return params;
            }],
            search: ['searchParams', 'results', 'mediaApi',
                     function(searchParams, results, mediaApi) {
                // TODO: only resolve if the initial search has happened.

                // Arbitrary limit of number of results; too many and the
                // scrollbar becomes hyper-sensitive
                const searchFilteredLimit = 5000;
                // When reviewing all images, we accept a degraded scroll
                // experience to allow seeing around one day's worth of images
                const searchAllLimit = 20000;

                // this is the initial search to get the count and newest image added data
                // TODO: ^ Why do we need two calls
                const search$ = (params) => {
                    return Rx.Observable.fromPromise(
                        mediaApi.search(params.get('query'), params.delete('query').toJS()));
                };
                const initResult$ = searchParams.map$.concatMap(params => {
                    const initParams = params.set('length', 1).set('sort', 'newest');
                    return search$(initParams);
                });
                const total$ = initResult$.map(images => images.total);
                const searchUntil$ = initResult$.map(images =>
                    images.data[0] && images.data[0].data.uploadTime
                );
                const results$ = searchParams.map$.combineLatest(searchUntil$, (params, until) =>
                    params.set('until', until)
                ).concatMap(params => search$(params));

                // Move to another resolver
                const sparseArray = len => {
                    const a = [];
                    a.length = len;
                    return a;
                };
                const resultOps = new Rx.Subject();
                const imagesAll$ = results.items$.scan();

                return {
                    total$,
                    results$,
                    imagesAll$,
                    loadRange: (start, end) => {
                        const length = end - start + 1;

                    }
                };
            }]
        }
    }).
    state('search.results', {
        url: '',
        views: {
            query: {
                template: searchQueryTemplate,
                controller: 'SearchQueryCtrl',
                controllerAs: 'searchQuery'
            },
            results: {
                template: searchResultsTemplate,
                controller: 'SearchResultsCtrl',
                controllerAs: 'ctrl'
            },
            panel: {
                template: panelTemplate,
                controller: 'GrPanelCtrl',
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
    });
}]);
