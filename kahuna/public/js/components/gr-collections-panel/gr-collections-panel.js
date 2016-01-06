import angular from 'angular';
import Rx from 'rx';
import '../../util/rx';

import '../../services/panel';
import '../../services/api/collections-api';
import '../../services/api/media-api';
import '../../directives/gr-auto-focus';

import './gr-collections-panel.css!';
import {getCollection} from '../../search-query/query-syntax';
import nodeTemplate from './gr-collections-panel-node.html!text';

export var grCollectionsPanel = angular.module('grCollectionsPanel', [
    'kahuna.services.panel',
    'util.rx'
]);

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
    ctrl.selectedCollections = selectedCollections || [];
}]);

grCollectionsPanel.controller('GrNodeCtrl',
    ['$scope', 'collections', 'subscribe$', 'inject$',
    function($scope, collections, subscribe$, inject$) {

    const ctrl = this;
    ctrl.saving = false;
    ctrl.deletable = false;
    ctrl.addChild = childName => collections.addChildTo(ctrl.node, childName);
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
        add$.onNext(ctrl.node.data.content.path);
    };

    subscribe$($scope, pathWithImages$, ({path, images}) => {
       collections.addImagesToCollection(images, path).then(() => ctrl.saving = false);
    });

    inject$($scope, hasImagesSelected$, ctrl, 'hasImagesSelected');


    ctrl.isSelected = ctrl.selectedCollections.some(col => {
        return angular.equals(col, ctrl.node.data.content.path);
    });

}]);

grCollectionsPanel.directive('grNode', ['$parse', '$compile', function($parse, $compile) {
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
        link: function(scope, element) {
            // We compile the template on the fly here as angular doesn't deal
            // well with recursive templates.
            $compile(`<gr-nodes
                gr:selected-images="ctrl.selectedImages$"
                gr:selected-collections="ctrl.selectedCollections"
                gr:editing="ctrl.editing"
                ng:show="showChildren"
                gr:nodes="ctrl.node.data.children"
                ng:if="ctrl.node.data.children.length > 0"></gr-nodes>
            `)(scope, cloned => {
                element.find('.node__children').append(cloned);
            });

            scope.clearForm = () => {
                scope.active = false;
                scope.childName = '';
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

    const className = 'collection-drop';
    const classDrag = 'collection-drop--drag-over';
    const classComplete = 'collection-drop--complete';
    const classSaving = 'collection-drop--saving';

    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            const collectionPath = $parse(attrs.grDropIntoCollection)(scope);
            element.addClass(className);

            element.on('drop', jqEv => {
                const dt = jqEv.originalEvent.dataTransfer;
                const gridImagesData = dt.getData(vndMimeTypes.get('gridImagesData'));
                const gridImageData = dt.getData(vndMimeTypes.get('gridImageData'));

                if (gridImagesData !== '' && gridImageData !== '') {
                    // TODO: potentially add some UI feedback on adding to collection
                    const imagesData = gridImagesData !== '' ?
                        JSON.parse(gridImagesData) : [JSON.parse(gridImageData)];

                    const imageIds = imagesData.map(imageJson => imageJson.id);

                    // TODO: Find a better way of dealing with this state than classnames
                    element.addClass(classSaving);
                    collections.addImageIdsToCollection(imageIds, collectionPath).then(() => {
                        element.removeClass(classSaving);
                        element.addClass(classComplete);
                        $timeout(() => {
                            element.removeClass(classComplete);
                        }, 500);
                    });
                }
                element.removeClass(classDrag);
            });

            element.on('dragover', () => {
                element.addClass(classDrag);
            });

            element.on('dragleave', () => {
                element.removeClass(classDrag);
            });
        }
    };
}]);
