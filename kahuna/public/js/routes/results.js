import angular from 'angular';
import Rx from 'rx';
import Immutable from 'immutable';

import '../results/results';
import searchResultsTemplate from '../results/results.html!text';
import panelTemplate         from '../components/gr-panel/gr-panel.html!text';

// TODO: do better things with these deps
import '../preview/image';
import '../lib/data-structure/list-factory';
import '../lib/data-structure/ordered-set-factory';
import '../components/gr-panel/gr-panel';

export const resultsRouter = angular.module('gr.routes.results', [
    'kahuna.search.results',
    'kahuna.preview.image',
    'kahuna.image.controller',
    'data-structure.list-factory',
    'data-structure.ordered-set-factory',
    'grPanel'
]);

resultsRouter.config(['$stateProvider', function($stateProvider) {

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
                controllerAs: 'ctrl',
                data: {

                }
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
