import angular from 'angular';
import Rx from 'rx';
import '../../util/rx';

import '../../services/panel';
import {collectionsApi} from '../../services/api/collections-api';
import {mediaApi}       from '../../services/api/media-api';
import '../../directives/gr-auto-focus';
import '../../util/eq';

import './gr-collections-panel.css!';
import {getCollection} from '../../search-query/query-syntax';
import nodeTemplate from './gr-collections-panel-node.html!text';

export var grCollectionsPanel = angular.module('grCollectionsPanel', [
    'kahuna.services.panel',
    collectionsApi.name,
    mediaApi.name,
    'util.rx',
    'util.eq'
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
    'collections', 'selectedImages$', 'selectedCollections',
    function (collections, selectedImages$, selectedCollections) {

    const ctrl = this;

    ctrl.isVisible = false;
    ctrl.error = false;

    collections.getCollections().then(collections => {
        ctrl.collections = collections.data.children;
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
    const pathId = ctrl.node.data.data.pathId;

    ctrl.saving = false;
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

    // TODO: move this somewhere sensible, we probably don't want an observable for each node.
    const add$ = new Rx.Subject();
    const pathWithImages$ =
            add$.withLatestFrom(ctrl.selectedImages$, (path, images) => ({path, images}));

    const hasImagesSelected$ = ctrl.selectedImages$.map(i => i.size > 0);
    ctrl.addImagesToCollection = () => {
        ctrl.saving = true;
        add$.onNext(ctrl.node.data.fullPath);
    };

    subscribe$($scope, pathWithImages$, ({path, images}) => {
       collections.addImagesToCollection(images, path).then(() => ctrl.saving = false);
    });

    inject$($scope, hasImagesSelected$, ctrl, 'hasImagesSelected');

    $scope.$watch('ctrl.showChildren', onValChange(show => {
        collectionsTreeState.setState(pathId, show);
    }));

    ctrl.isSelected = ctrl.selectedCollections.some(col => {
        return angular.equals(col, ctrl.node.data.fullPath);
    });

}]);

grCollectionsPanel.directive('grNode', ['$parse', '$compile', function($parse, $compile) {
    const templateString = `<gr-nodes
                                ng:if="ctrl.showChildren && ctrl.node.data.children.length > 0"
                                gr:selected-images="ctrl.selectedImages$"
                                gr:selected-collections="ctrl.selectedCollections"
                                gr:editing="ctrl.editing"
                                gr:nodes="ctrl.node.data.children"></gr-nodes>`;
    return {
        restrict: 'E',
        scope: {
            node: '=grNode',
            nodeList: '=grNodeList',
            editing: '=grEditing',
            selectedImages$: '=grSelectedImages',
            selectedCollections: '=grSelectedCollections'
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
            return function link(scope, element) {
                if (! compiledTemplate) {
                    // We compile the template on the fly here as angular doesn't deal
                    // well with recursive templates.
                    compiledTemplate = $compile(templateString);
                }

                compiledTemplate(scope, cloned => {
                    element.find('.node__children').append(cloned);
                });

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
            nodes: '=grNodes',
            editing: '=grEditing',
            selectedImages$: '=grSelectedImages',
            selectedCollections: '=grSelectedCollections'
        },
        template: `<ul>
            <li ng:repeat="node in nodes">
                <gr-node
                    class="node"
                    gr:selected-images="selectedImages$"
                    gr:selected-collections="selectedCollections"
                    gr:node="node"
                    gr:node-list="nodes"
                    gr:editing="editing"></gr-node>
            </li>
        </ul>`
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

            element.on('drop', jqEv => {
                const dt = jqEv.originalEvent.dataTransfer;
                const gridImagesData = dt.getData(vndMimeTypes.get('gridImagesData'));
                const gridImageData = dt.getData(vndMimeTypes.get('gridImageData'));

                if (gridImagesData !== '' || gridImageData !== '') {
                    const imagesData = gridImagesData !== '' ?
                        JSON.parse(gridImagesData) : [JSON.parse(gridImageData)];

                    const imageIds = imagesData.map(imageJson => imageJson.data.id);
                    scope.dropIntoCollectionSaving = true;
                    collections.addImageIdsToCollection(imageIds, collectionPath).then(() => {
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
