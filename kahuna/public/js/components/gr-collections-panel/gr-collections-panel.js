import angular from 'angular';

import '../../services/panel';
import '../../services/api/collections-api';
import '../../directives/gr-auto-focus';

import './gr-collections-panel.css!';

export var grCollectionsPanel = angular.module('grCollectionsPanel', [
    'kahuna.services.panel']);

grCollectionsPanel.controller('GrCollectionsPanelCtrl', [
    'panelService',
    '$rootScope',
    'collections',
    function (panelService, $rootScope, collections) {

    const ctrl = this;
    const panelName = 'gr-collections-panel';

    ctrl.isVisible = false;

    panelService.addPanel(panelName, false);
    panelService.available(panelName, true);

    $rootScope.$on(
        `ui:panels:${panelName}:updated`,
        () => {
            ctrl.isVisible = panelService.isVisible(panelName);
        }
    );

    collections.getCollections().then(collections => {
        ctrl.collections = collections.data.children;
    }, e => console.log(e));

}]);

grCollectionsPanel.controller('GrNodesCtrl', ['$scope', 'collections',
    function($scope, collections) {

        const ctrl = this;

        ctrl.hasChildren = false;

        ctrl.remove = node => {
            collections.removeCollection(node.content)
                .then(() => {
                    const cleanNodes = ctrl.nodes.filter(elem => elem.name !== node.name);
                    ctrl.nodes = cleanNodes;
                });
        };

        ctrl.addChild = node => {
            const newCollectionPath = node.content.data.path.concat([ctrl.newCollection]);

            collections.addCollection(newCollectionPath)
                .then(newCollectionResource => {
                    node.children = [newCollectionResource].concat(node.children);
                });

            ctrl.newCollection = '';
        };

    }
]);

grCollectionsPanel.directive('grNode', ['$parse', '$compile', function($parse, $compile) {
    return {
        restrict: 'E',
        scope: {
            node: '=grNode'
        },
        template: `<div class="node"></div>`,
        link: function(scope, element, attrs) {
            const node = $parse(attrs.grNode)(scope);
            element.append(`<gr-nodes gr:nodes="node.data.children"></gr-nodes>`);
            $compile(element.contents())(scope);
        }
    };

}]);

grCollectionsPanel.directive('grNodes', function() {
    return {
        restrict: 'E',
        scope: {
            nodes: '=grNodes'
        },
        template: `<ul class="nodes">
            <li ng:repeat="node in ctrl.nodes"
                class="tree-node"
                ng:class="{'tree-node--leaf' : node.data.children.length === 0}">
                <div class="tree-node__content">
                    <button type="button"
                        class="tree-node__arrow clickable"
                        ng:click="hideChildren = !hideChildren"
                        ng:show="node.data.children.length > 0">
                        <span ng:show="hideChildren">▸</span>
                        <span ng:hide="hideChildren">▾</span>

                    </button>
                    <a ui:sref="search.results({query: (node.data.name)})">{{node.data.name}}</a>

                    <div class="node__edits">
                        <button ng:if="node.data.children.length === 0"
                            class="inner-clickable"
                            type="button"
                            ng:click="ctrl.remove(node)">
                            <gr-icon-label gr-icon="delete"></gr-icon-label>
                        </button>
                    </div>

                    <gr-icon ng:click="active = !active" class="clickable">add_box</gr-icon>

                    <form ng:show="active" ng:submit="ctrl.addChild(node); active = !active; displayChildren = true">
                        <input type="text"
                            required
                            ng:model="ctrl.newCollection"/>
                        <button type="submit">
                            <gr-icon-label gr-icon="check"></gr-icon-label>
                        </button>
                        <button type="button" ng:click="active = false; ctrl.newCollection=''" title="Close">
                            <gr-icon-label gr-icon="close"></gr-icon-label>
                        </button>
                    </form>
                </div>

                <gr-node ng:hide="hideChildren" gr:node="node"></gr-node>

            </li>
        </ul>`,
        controller: 'GrNodesCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    }
});
