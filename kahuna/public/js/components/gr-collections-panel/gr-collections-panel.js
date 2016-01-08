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
    'collections', 'selectedImages$',
    function (collections, selectedImages$) {

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
}]);

grCollectionsPanel.controller('GrNodeCtrl',
    ['$scope', 'collections', 'subscribe$', 'inject$',
    function($scope, collections, subscribe$, inject$) {

    const ctrl = this;
    ctrl.saving = false;
    ctrl.deletable = false;
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
        add$.onNext(ctrl.node.data.content.path);
    };

    subscribe$($scope, pathWithImages$, ({path, images}) => {
       collections.addImagesToCollection(images, path).then(() => ctrl.saving = false);
    });

    inject$($scope, hasImagesSelected$, ctrl, 'hasImagesSelected');


}]);

grCollectionsPanel.directive('grNode', ['$parse', '$compile', function($parse, $compile) {
    return {
        restrict: 'E',
        scope: {
            node: '=grNode',
            nodeList: '=grNodeList',
            editing: '=grEditing',
            selectedImages$: '=grSelectedImages'
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
                scope.formError = null;
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
            selectedImages$: '=grSelectedImages'
        },
        template: `<ul>
            <li ng:repeat="node in nodes">
                <gr-node
                    class="node"
                    gr:selected-images="selectedImages$"
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
