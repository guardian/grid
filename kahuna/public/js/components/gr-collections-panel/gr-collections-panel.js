import angular from 'angular';
import Rx from 'rx';
import '../../util/rx';

import '../../services/panel';
import {collectionsApi} from '../../services/api/collections-api';
import {mediaApi}       from '../../services/api/media-api';
import '../../directives/gr-auto-focus';
import '../../util/eq';

import './gr-collections-panel.css';
import {getCollection} from '../../search-query/query-syntax';
import nodeTemplate from './gr-collections-panel-node.html';
import '../../directives/gr-auto-focus';

export var grCollectionsPanel = angular.module('grCollectionsPanel', [
    'kahuna.services.panel',
    collectionsApi.name,
    mediaApi.name,
    'util.rx',
    'util.eq',
    'gr.autoFocus'
]);

grCollectionsPanel.factory('collectionsTreeState', ['$window', function($window) {
    // TODO: Add garbage collection to state.
    const localStorageKey = 'collectionsTreeOpen';
    const jsonStr = $window.localStorage.getItem(localStorageKey) || '[]';

    // A little bit of superstition in case this was set weirdly before.
    let jsonArr = [];
    try {
        jsonArr = JSON.parse(jsonStr);
        if (!Array.isArray(jsonArr)) {
            jsonArr = [];
            $window.localStorage.setItem(localStorageKey, '[]');
        }
    } catch (_) {
        // On JSON.parse fail - use default
    }
    const stateCache = new Set(jsonArr);


    function setState(pathId, show) {
        if (show) {
            stateCache.add(pathId);
        } else {
            stateCache.delete(pathId);
        }
        $window.localStorage.setItem(localStorageKey, JSON.stringify(Array.from(stateCache)));
    }

    function getState(pathId) {
        return stateCache.has(pathId);
    }

    return {
        setState,
        getState
    };

}]);

grCollectionsPanel.controller('GrCollectionsPanelCtrl', [
    '$scope', '$timeout', 'collections', 'selectedImages$', 'selectedCollections',
    function ($scope, $timeout, collections, selectedImages$, selectedCollections) {

    const ctrl = this;

    ctrl.error = false;

    collections.getCollections().then(collections => {
        ctrl.collections = collections.data.children;
        // this will trigger the remember-scroll-top directive to return
        // users to their previous position on the collections panel
        // once the tree has been rendered
        $timeout(() => {
            $scope.$emit('gr:remember-scroll-top:apply');
        });
    }, () => {
        // TODO: More informative error handling
        // TODO: Stop error propagating to global error handler
        ctrl.error = true;
    }).catch(() => ctrl.error = true);

    ctrl.selectedImages$ = selectedImages$;
    ctrl.selectedCollections = selectedCollections;
}]);

grCollectionsPanel.controller('GrNodeCtrl',
    ['$scope', 'collections', 'subscribe$', 'inject$', 'onValChange', 'collectionsTreeState',
    function($scope, collections, subscribe$, inject$, onValChange, collectionsTreeState) {

    const ctrl = this;

    try {
      ctrl.node.data.data.pathId;
    } catch (e) {
      console.info('unable to find pathId for node, tree failing to render to completion');
      console.info(ctrl.node);
    }

    const pathId = ctrl.node.data.data.pathId;

    //This filter remove child nodes with missing data, preventing display errors from occurring
    ctrl.children = ctrl.node.data.children.filter(node => !!node.data.data);

    ctrl.saving = false;
    ctrl.removing = false;
    ctrl.deletable = false;
    ctrl.showChildren = collectionsTreeState.getState(pathId);
    ctrl.formError = null;

    ctrl.addChild = childName => {
        return collections.addChildTo(ctrl.node, childName).
        then($scope.clearForm).
        catch(e => $scope.formError = e.body && e.body.errorMessage);
    };

    collections.isDeletable(ctrl.node).then(d => ctrl.deletable = d);

    ctrl.remove = () => collections.removeFromList(ctrl.node, ctrl.nodeList);
    ctrl.getCollectionQuery = path => getCollection(path);

    $scope.$watch('ctrl.showChildren', onValChange(show => {
            collectionsTreeState.setState(pathId, show);
    }));

    ctrl.init = function(grCollectionTreeCtrl) {
        const selectedImages$ = grCollectionTreeCtrl.selectedImages$;
        const selectedCollections = grCollectionTreeCtrl.selectedCollections;

        // TODO: move this somewhere sensible, we probably don't want an observable for each node.
        const add$ = new Rx.Subject();
        const pathWithImages$ =
                add$.withLatestFrom(selectedImages$, (path, images) => ({path, images}));
        const hasImagesSelected$ = selectedImages$.map(i => i.size > 0);

        ctrl.addImagesToCollection = () => {
            ctrl.saving = true;
            add$.onNext(ctrl.node.data.fullPath);
        };

        subscribe$($scope, pathWithImages$, ({path, images}) => {
           collections.addToCollectionUsingImageResources(images, path)
           .then(() => ctrl.saving = false);
        });

        const remove$ = new Rx.Subject();
        const pathToRemoveWithImages$ =
                remove$.withLatestFrom(selectedImages$, (path, images) => ({path, images}));

        ctrl.removeImagesFromCollection = () => {
            ctrl.removing = true;
            remove$.onNext(pathId);
        };

        subscribe$($scope, pathToRemoveWithImages$, ({path, images}) => {
            collections.batchRemove(images, path).then(() => ctrl.removing = false);
        });

        inject$($scope, hasImagesSelected$, ctrl, 'hasImagesSelected');

        ctrl.isSelected = selectedCollections.some(col => {
            return angular.equals(col, pathId);
        });

        ctrl.hasCustomSelect = !! grCollectionTreeCtrl.onSelect;

        ctrl.select = () => {
            grCollectionTreeCtrl.onSelect({$collection: ctrl.node.data.data.path});
        };

    };
}]);

grCollectionsPanel.directive('grNode', ['$parse', '$compile', function($parse, $compile) {
    const templateString = `<gr-nodes
                                ng:if="ctrl.showChildren && ctrl.node.data.children.length > 0"
                                gr:nodes="ctrl.children"
                                ></gr-nodes>`;
    return {
        restrict: 'E',
        require: ['grNode', '^^grCollectionTree'],
        scope: {
            node: '=grNode',
            nodeList: '=grNodeList'
        },
        template: nodeTemplate,
        controller: 'GrNodeCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        compile: function() {
            // Memoize the `$compile` result for performance reasons
            // (compile invoked once per reference, link invoked once
            // per use)
            let compiledTemplate;
            return function link(scope, element, attrs, [grNodeCtrl, grCollectionTreeCtrl]) {
                if (! compiledTemplate) {
                    // We compile the template on the fly here as angular doesn't deal
                    // well with recursive templates.
                    compiledTemplate = $compile(templateString);
                }

                compiledTemplate(scope, cloned => {
                    const container = element.find('gu-template-container');
                    Array.from(cloned).forEach(clone => container.append(clone));
                });

                grNodeCtrl.init(grCollectionTreeCtrl);

                //so editing can toggle - used to show add & remove collection buttons
                scope.grCollectionTreeCtrl = grCollectionTreeCtrl;

                scope.clearForm = () => {
                    scope.active = false;
                    scope.childName = '';
                    scope.formError = null;
                };
            };
        }
    };

}]);

grCollectionsPanel.directive('grNodes', function() {
    return {
        restrict: 'E',
        scope: {
            nodes: '=grNodes'
        },
        controller: function(){},
        controllerAs: 'grNodesCtrl',
        bindToController: true,
        template: `<ul>
            <li ng:repeat="node in grNodesCtrl.nodes">
                <gr-node
                    class="node"
                    gr:node="node"
                    gr:node-list="grNodesCtrl.nodes"
                    ></gr-node>
            </li>
        </ul>`
    };
});

grCollectionsPanel.directive('grCollectionTree', function() {
    return {
        restrict: 'E',
        scope: {
            nodes: '=grNodes',
            editing: '=?grEditing',
            selectedImages$: '=?grSelectedImages',
            selectedCollections: '=?grSelectedCollections',
            selectionMode: '=?grSelectionMode',
            onSelect: '&?grOnSelect'
        },
        controller: function(){
            const grCollectionTreeCtrl = this;

            if (! grCollectionTreeCtrl.selectedImages$) {
                grCollectionTreeCtrl.selectedImages$ = Rx.Observable.empty();
            }

            if (! grCollectionTreeCtrl.selectedCollections) {
                grCollectionTreeCtrl.selectedCollections = [];
            }


        },
        controllerAs: 'grCollectionTreeCtrl',
        bindToController: true,
        template: `<gr-nodes gr:nodes="grCollectionTreeCtrl.nodes"></gr-nodes>`
    };
});

grCollectionsPanel.directive('grDropIntoCollection',
    ['$timeout', '$parse', 'vndMimeTypes', 'collections',
    function($timeout, $parse, vndMimeTypes, collections) {

    const dragOverClass = 'collection-drop-drag-over';

    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            const collectionPath = $parse(attrs.grDropIntoCollection)(scope);

            element.on('drop', e => {
                const dt = e.dataTransfer;
                const gridImagesData = dt.getData(vndMimeTypes.get('gridImagesData'));
                const gridImageData = dt.getData(vndMimeTypes.get('gridImageData'));

                if (gridImagesData !== '' || gridImageData !== '') {
                    const imagesData = gridImagesData !== '' ?
                        JSON.parse(gridImagesData) : [JSON.parse(gridImageData)];

                    const imageIds = imagesData.map(imageJson => imageJson.data.id);
                    scope.dropIntoCollectionSaving = true;
                    collections.addToCollectionUsingImageIds(imageIds, collectionPath).then(() => {
                        scope.dropIntoCollectionSaving = false;
                    });
                }
                element.removeClass(dragOverClass);
            });

            element.on('dragover', () => {
                element.addClass(dragOverClass);
            });

            element.on('dragleave', () => {
                element.removeClass(dragOverClass);
            });
        }
    };
}]);
