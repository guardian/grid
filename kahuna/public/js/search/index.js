import angular from 'angular';
import 'angular-ui-router-extras';
import Rx from 'rx';
import 'rx-dom';
import Immutable from 'immutable';
import {getCollectionsFromQuery} from '../search-query/query-syntax';

import './query';
import './results';
import '../preview/image';
import '../lib/data-structure/list-factory';
import '../lib/data-structure/ordered-set-factory';
import '../components/gr-top-bar/gr-top-bar';
import '../components/gr-panel/gr-panel';
import '../components/gr-collections-panel/gr-collections-panel';
import '../components/gr-keyboard-shortcut/gr-keyboard-shortcut';

import '../components/gr-panels/gr-panels';

import searchTemplate        from './view.html!text';
import searchResultsTemplate from './results.html!text';
import panelTemplate        from '../components/gr-panel/gr-panel.html!text';
import collectionsPanelTemplate from
    '../components/gr-collections-panel/gr-collections-panel.html!text';


export var search = angular.module('kahuna.search', [
    'ct.ui.router.extras.dsr',
    'kahuna.search.query',
    'kahuna.search.results',
    'kahuna.preview.image',
    'data-structure.list-factory',
    'data-structure.ordered-set-factory',
    'gr.topBar',
    'gr.panels',
    'gr.keyboardShortcut',
    'grPanel',
    'grCollectionsPanel',
    'ui.router'
]);

// TODO: add a resolver here so that if we error (e.g. 401) we don't keep trying
// to render - similar to the image controller see:
// https://github.com/guardian/media-service/pull/478
search.config(['$stateProvider', '$urlMatcherFactoryProvider',
               function($stateProvider, $urlMatcherFactoryProvider) {

    const zeroWidthSpace = /[\u200B]/g;
    function removeUtf8SpecialChars(val) {
        return angular.isDefined(val) && val.replace(zeroWidthSpace, '');
    }

    $urlMatcherFactoryProvider.type('Query', {
        encode: val => removeUtf8SpecialChars(val),
        decode: val => removeUtf8SpecialChars(val),
        //call decode value that includes zero-width-space character
        is: val => angular.isDefined(val) && !zeroWidthSpace.test(val)
    });

    $stateProvider.state('search', {
        // FIXME [1]: This state should be abstract, but then we can't navigate to
        // it, which we need to do to access it's deeper / remembered chile state
        url: '/',
        template: searchTemplate,
        deepStateRedirect: {
            // Inject a transient $stateParams for the results state
            // below to pick up and expose
            fn: ['$dsr$', function($dsr$) {
                const params = angular.extend({}, $dsr$.redirect.params, {
                    isDeepStateRedirect: true
                });
                return {state: $dsr$.redirect.state, params};
            }]
        },
        controllerAs: 'ctrl',
        controller: ['$scope', 'panels', 'shortcutKeys', 'hotkeys', 'keyboardShortcut',
                     function($scope, panels, shortcutKeys, keyboardShortcut) {

            const ctrl = this;
            ctrl.collectionsPanel = panels.collectionsPanel;
            ctrl.metadataPanel = panels.metadataPanel;

            keyboardShortcut.bindTo($scope).add({
                combo: shortcutKeys.get('metadataPanel'),
                description: 'Toggle metadata panel',
                callback: panels.metadataPanel.toggleHidden
            });
        }],
        resolve: {
            shortcutKeys: [function() {
                // keep the shortcut keys here to stop overriding
                return new Map([['metadataPanel', 'm']]);
            }],
            panels: ['panelService', function(panelService) {
                const collectionsPanel = panelService.createPanel(true);
                const metadataPanel = panelService.createPanel(true);

                return { collectionsPanel, metadataPanel };
           }]
        }
    });

    $stateProvider.state('search.results', {
        url: 'search?{query:Query}&ids&since&nonFree&uploadedBy&until&orderBy',
        // Non-URL parameters
        params: {
            // Routing-level property indicating whether the state has
            // been loaded as part of a deep-state redirect. Note that
            // this param gets cleared below so it should never reach
            // controllers
            isDeepStateRedirect: {value: false, type: 'bool'}
        },
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
            selectedCollections: ['$stateParams', function($stateParams) {
                const query = $stateParams.query || '';
                const collections  = getCollectionsFromQuery(query);
                return collections;
            }]
        },
        views: {
            results: {
                template: searchResultsTemplate,
                controller: 'SearchResultsCtrl',
                controllerAs: 'ctrl'
            },
            infoPanel: {
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
            },
            collectionPanel: {
                template: collectionsPanelTemplate,
                controller: 'GrCollectionsPanelCtrl',
                controllerAs: 'ctrl'
            },
            multiDrag: {
                template: `<div class="multidrag"></div>`,
                controller: ['$scope', '$window', '$document', '$element', 'vndMimeTypes',
                             'selectedImages$',
                             function($scope, $window, $document, $element, vndMimeTypes,
                                      selectedImages$) {

                    const windowDrag$ = Rx.DOM.fromEvent($window, 'dragstart');
                    const dragData$ = windowDrag$.
                        withLatestFrom(selectedImages$, (event, imagesList) => {
                            const images = imagesList.toJS();
                            const dt = event.dataTransfer;
                            return {images, dt};
                        });

                    const sub = dragData$.subscribe(({ images, dt }) => {
                        if (images.size > 0) {
                            const doc = $document[0];
                            const el = $element[0];

                            //creates an element to use as the drag icon
                            const dragImage = doc.createElement('div');
                                  dragImage.classList.add('drag-icon');

                            const imageCount = doc.createElement('span');
                                  imageCount.classList.add('drag-count');
                                  imageCount.innerHTML = images.count();

                            dragImage.appendChild(imageCount);
                            el.appendChild(dragImage);

                            dt.setData(vndMimeTypes.get('gridImagesData'), JSON.stringify(images));
                            dt.setDragImage(dragImage, 0, 0);
                        }
                    });

                    $scope.$on('$destroy', () => sub.dispose());
                }]
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
