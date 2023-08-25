import angular from 'angular';
import 'ui-router-extras';
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
import '../components/gr-info-panel/gr-info-panel';
import '../components/gr-collections-panel/gr-collections-panel';
import '../components/gr-keyboard-shortcut/gr-keyboard-shortcut';
import '../components/gr-permissions-filter/gr-permissions-filter';
import '../components/gr-search-wrapper/gr-search-wrapper';
import '../util/storage';

import '../components/gr-panels/gr-panels';

import searchTemplate        from './view.html';
import searchResultsTemplate from './results.html';
import panelTemplate        from '../components/gr-info-panel/gr-info-panel.html';
import collectionsPanelTemplate from
    '../components/gr-collections-panel/gr-collections-panel.html';
import {cropUtil} from '../util/crop';
import * as PermissionsConf from '../components/gr-permissions-filter/gr-permissions-filter-config';

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
    'gr.permissionsFilter',
    'gr-searchWrapper',
    'grInfoPanel',
    'grCollectionsPanel',
    'ui.router',
  cropUtil.name
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
        url: '/?cropType&customRatio',
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
        controller: [
            '$scope', '$window', '$stateParams', 'panels', 'shortcutKeys', 'keyboardShortcut',
            'panelService', 'cropSettings', 'mediaApi', 'storage', '$state',
            function($scope, $window, $stateParams, panels, shortcutKeys, keyboardShortcut,
                     panelService, cropSettings, mediaApi, storage, $state) {

            const ctrl = this;

            ctrl.canUpload = false;
            ctrl.usePermissionsFilter = window._clientConfig.usePermissionsFilter;

            mediaApi.canUserUpload().then(canUpload => {
                ctrl.canUpload = canUpload;
            });

            cropSettings.set($stateParams);

            ctrl.onLogoClick = () => {
                mediaApi.getSession().then(session => {
                const showPaid = ctrl.usePermissionsFilter ? true : (session.user.permissions.showPaid ? session.user.permissions.showPaid : undefined);
                const defaultNonFreeFilter = {
                  isDefault: true,
                  isNonFree: showPaid ? showPaid : false
                };
                storage.setJs("defaultNonFreeFilter", defaultNonFreeFilter, true);
                $state.go('search.results', {nonFree: defaultNonFreeFilter.isNonFree});
              });
            };

            if ($state.current.name === 'search') {
              mediaApi.getSession().then(session => {
                const showPaid = ctrl.usePermissionsFilter ? true : (session.user.permissions.showPaid ? session.user.permissions.showPaid : undefined);
                storage.setJs('isNonFree', showPaid, true);
              });
            }

            //-permissions filter-
            let pfOpts = PermissionsConf.PermissionsOptions();
            let uType = "standard"; //<-- need to derive this from the user and session???
            let defOptVal = PermissionsConf.PermissionsDefaultOpt().filter(ut => ut.includes(uType))[0].split("#")[1];
            let pfDefPerm = pfOpts.filter(opt => opt.value == defOptVal)[0];
            let permSel = function(permissionsSelection) {
              console.log("Permissions Selection : " + permissionsSelection.label);
            }
            ctrl.permissionsProps = { options: pfOpts, selectedOption: pfDefPerm, onSelect: permSel, chargeable: false, query: ctrl.filter?ctrl.filter.query:"", userType: uType };
            //-end permissions filter-

            ctrl.collectionsPanel = panels.collectionsPanel;
            ctrl.metadataPanel = panels.metadataPanel;

            panelService.setAndSaveState($scope, 'collections', ctrl.collectionsPanel);
            panelService.setAndSaveState($scope, 'metadata', ctrl.metadataPanel);

            keyboardShortcut.bindTo($scope).add({
                combo: shortcutKeys.get('metadataPanel'),
                description: 'Toggle metadata panel',
                callback: panels.metadataPanel.toggleHidden
            });

            keyboardShortcut.bindTo($scope).add({
                combo: shortcutKeys.get('collectionsPanel'),
                description: 'Toggle collections panel',
                callback: panels.collectionsPanel.toggleHidden
            });
        }],
        resolve: {
            shortcutKeys: [function() {
                // keep the shortcut keys here to stop overriding
                return new Map([
                    ['metadataPanel', 'm'],
                    ['collectionsPanel', 'l']
                ]);
            }],
            panels: ['panelService', function(panelService) {
                const collectionsPanel = panelService.createPanel(true);
                const metadataPanel = panelService.createPanel(true);

                return { collectionsPanel, metadataPanel };
           }]
        }
    });

    const extraQueryParamsNotUsedByGridDirectly = [
      'expandPinboard', 'pinboardId', 'pinboardItemId'
    ];

    $stateProvider.state('search.results', {
        url: [
            'search?{query:Query}',
            'ids',
            'since',
            'nonFree',
            'payType',
            'uploadedBy',
            'until',
            'orderBy',
            'dateField',
            'takenSince',
            'takenUntil',
            'modifiedSince',
            'modifiedUntil',
            'hasRightsAcquired',
            'hasCrops',
            'syndicationStatus',
            'persisted',
            ...extraQueryParamsNotUsedByGridDirectly // otherwise router will drop them
        ].join('&'),
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
                controller: 'GrInfoPanelCtrl',
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
                        if (images.length > 0) {
                            const doc = $document[0];
                            const el = $element[0];

                            //creates an element to use as the drag icon
                            const dragImage = doc.createElement('div');
                                  dragImage.classList.add('drag-icon');

                            const imageCount = doc.createElement('span');
                                  imageCount.classList.add('drag-count');
                                  imageCount.innerHTML = images.length;

                            // we do this as we cannot stringify Resource objects
                            const imageObjs = images.map(i => ({data: i.data}));

                            dragImage.appendChild(imageCount);
                            el.appendChild(dragImage);

                            dt.setData(
                                vndMimeTypes.get('gridImagesData'),
                                JSON.stringify(imageObjs));

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
    $rootScope.$on('$stateChangeStart', (_, toState, toParams, fromState, fromParams) => {
        if (toState.name === 'search.results') {
            //If moving to a collection, sorts images by time added to a collection by default
            //allows sorting by newest first if set by user.
            if (toParams.query && toParams.query.indexOf('~') === 0) {
                const sameQuery = toParams.query === fromParams.query;
                toParams.orderBy = sameQuery ? toParams.orderBy : 'dateAddedToCollection';
            }
            //If moving from a collection to a non-collection, reset order to default.
            else if (toParams.orderBy === 'dateAddedToCollection') {
                delete toParams.orderBy;
            }
        }
    });
}]);
