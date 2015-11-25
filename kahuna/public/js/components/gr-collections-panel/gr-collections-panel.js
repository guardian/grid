import angular from 'angular';

import '../../services/panel';
import '../../services/api/collections-api';

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


        collections.getCollections().then(data => {
            ctrl.collections = data;
        });

}]);

grCollectionsPanel.controller('GrNodeCtrl', [
    function() {

        const ctrl = this;

        ctrl.hideChildren = false;

        ctrl.toggleChildren = () => {
            ctrl.hideChildren = !ctrl.hideChildren;
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
            if (node.children.length > 0) {
                element.append(`<gr-nodes gr:nodes="node.children"></gr-nodes>`);
                $compile(element.contents())(scope);
            } else {
                element.remove();
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
            <li ng:repeat="node in ctrl.nodes"
                class="tree-node">
                <span class="tree-node__arrow clickable"
                ng:if="node.children.length > 0"
                ng:click="ctrl.toggleChildren()">▸</span>
                <a ui:sref="search.results({query: (node.name)})">{{node.name}}</a>
                <gr-node ng:hide="ctrl.hideChildren" gr:node="node"></gr-node>
            </li>
        </ul>`,
        controller: 'GrNodeCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    }
});
