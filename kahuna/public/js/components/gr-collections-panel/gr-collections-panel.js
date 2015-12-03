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

grCollectionsPanel.controller('GrNodeCtrl', ['collections', function(collections) {

    const ctrl = this;
    ctrl.deletable = false;
    ctrl.addChild = childName => collections.addChildTo(ctrl.node, childName);
    collections.isDeletable(ctrl.node).then(d => ctrl.deletable = d);

    ctrl.remove = () => collections.removeFromList(ctrl.node, ctrl.nodeList);

}]);


grCollectionsPanel.directive('grAddToCollection', [function() {
    return {
        link: function(scope, element) {
            element.on('drop', ev => {
                // Do drop
            });
        }
    }
}]);

grCollectionsPanel.directive('grNode', ['$parse', '$compile', function($parse, $compile) {
    return {
        restrict: 'E',
        scope: {
            node: '=grNode',
            nodeList: '=grNodeList'
        },
        template: `
        <div class="node" ng:init="node = ctrl.node">
            <div class="tree-node__content">
                <div class="node__parent flex-container" gr:add-to-collection>

                    <button type="button"
                        class="tree-node__arrow clickable"
                        ng:click="showChildren = !showChildren"
                        ng:show="node.data.children.length > 0">

                        <gr-icon ng:show="showChildren">expand_more</gr-icon>
                        <gr-icon ng:hide="showChildren">chevron_right</gr-icon>
                    </button>

                    <a class="flex-spacer" ui:sref="search.results({query: (node.data.name)})">{{node.data.name}}</a>

                    <div class="node__edits">
                        <button class="inner-clickable" type="button"
                            ng:if="ctrl.deletable"
                            ng:click="ctrl.remove()">
                            <gr-icon-label gr-icon="delete"></gr-icon-label>
                        </button>

                        <gr-icon ng:click="active = !active" class="clickable">add_box</gr-icon>
                    </div>
                </div>



                <form ng:show="active" ng:submit="ctrl.addChild(childName); active = !active; displayChildren = true">
                    <input type="text" required ng:model="childName"/>
                    <button type="submit">
                        <gr-icon-label gr-icon="check"></gr-icon-label>
                    </button>
                    <button type="button" ng:click="active = false; ctrl.newCollection=''" title="Close">
                        <gr-icon-label gr-icon="close"></gr-icon-label>
                    </button>
                </form>
            </div>
        </div>
        `,
        controller: 'GrNodeCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        link: function(scope, element, attrs, ctrl) {
            if (ctrl.node.data.children.length > 1) {
                $compile(`<gr-nodes ng:if="showChildren" gr:nodes="ctrl.node.data.children"></gr-nodes>`)(scope, cloned => {
                    element.append(cloned);
                });
            }
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
            <li class="tree-node" ng:repeat="node in nodes">
                <gr-node gr:node="node" gr:node-list="nodes"></gr-node>
            </li>
        </ul>`
    }
});
