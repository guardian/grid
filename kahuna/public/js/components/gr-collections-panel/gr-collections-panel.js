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
                // TODO add the image(s) to collection
                ev.currentTarget.classList.remove("drag-over");
            });

            element.on('dragover', ev => {
                ev.currentTarget.classList.add("drag-over");
            });

            element.on('dragleave', ev => {
                ev.currentTarget.classList.remove("drag-over");
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
        <div ng:init="node = ctrl.node; showChildren = true;">
            <div class="node__info flex-container" gr:add-to-collection>
                <div class="node__marker"></div>

                <div class="node__spacer" ng:if="node.data.children.length === 0">
                    <gr-icon></gr-icon>
                </div>

                <button type="button"
                    class="node__toggler clickable"
                    ng:click="showChildren = !showChildren"
                    ng:show="node.data.children.length > 0">

                    <gr-icon ng:show="showChildren">expand_more</gr-icon>
                    <gr-icon ng:hide="showChildren">chevron_right</gr-icon>
                </button>

                <a class="node__name flex-spacer" ui:sref="search.results({query: (node.data.name)})">{{node.data.name}}</a>


                <button class="node__action inner-clickable" type="button"
                    ng:if="ctrl.deletable"
                    ng:click="ctrl.remove()">
                    <gr-icon-label gr-icon="delete"></gr-icon-label>
                </button>

                <button class="node__action inner-clickable" type="button" ng:click="active = !active">
                    <gr-icon>add_box</gr-icon>
                </button>
            </div>

            <form ng:show="active" ng:submit="ctrl.addChild(childName).then(clearForm);">
                <input type="text" required ng:model="childName" />
                <button type="submit">
                    <gr-icon-label gr-icon="check"></gr-icon-label>
                </button>
                <button type="button" ng:click="clearForm()" title="Close">
                    <gr-icon-label gr-icon="close"></gr-icon-label>
                </button>
            </form>

            <div class="node__children"></div>
        </div>
        `,
        controller: 'GrNodeCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        link: function(scope, element, attrs, ctrl) {
            if (ctrl.node.data.children.length > 0) {
                $compile(`<gr-nodes class="tree" ng:show="showChildren" gr:nodes="ctrl.node.data.children"></gr-nodesclass>`)(scope, cloned => {
                    element.find('.node__children').append(cloned);
                });
            }

            scope.clearForm = () => {
                scope.active = false;
                scope.childName = '';
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
        template: `<ul>
            <li ng:repeat="node in nodes">
                <gr-node class="node" gr:node="node" gr:node-list="nodes"></gr-node>
            </li>
        </ul>`
    }
});
