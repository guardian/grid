import angular from 'angular';
import './gr-panels.css!';
import '../../services/panel';
import '../../util/rx';

export const panels = angular.module('gr.panels', ['kahuna.services.panel', 'util.rx']);

panels.directive('grPanels', [function() {
    return {
        restrict: 'E',
        replace: true,
        transclude: true,
        template: `<div class="gr-panels">
            <div class="gr-panels-content" ng:transclude></div>
        </div>`
    };
}]);

panels.directive('grPanel', ['$timeout', 'inject$', 'panelService',
                             function($timeout, inject$, panelService) {

    function setFullHeight(element) {
        const offset = element.position().top;
        const height = `calc(100vh - ${offset}px)`;

        element.css({ height });
    }

    return {
        restrict: 'E',
        replace: true,
        transclude: true,
        scope: {
            name: '@grName',
            left: '=?grLeft',
            right: '=?grRight',
            hidden: '=?grHidden'
        },
        template:
            `<div class="gr-panel" ng:class="{
                'gr-panel--left': left,
                'gr-panel--right': right,
                'gr-panel--hidden': hidden,
                'gr-panel--locked': locked }">
                <div class="gr-panel__content">
                    <ng:transclude></ng:transclude>
                </div>
            </div>`,
        link: function(scope, element) {
            // This is done to make sure we trigger on the template being rendered,
            // if we don't we get the semi-rendered template offset
            $timeout(() => setFullHeight(element), 0);

            // register panel to be controlled outside of scope
            const panel = panelService.createPanel(scope.name, scope);

            inject$(scope, panel.hidden$, scope, 'hidden');
            inject$(scope, panel.locked$, scope, 'locked');
        }
    };
}]);

panels.directive('grPanelContent', [function() {
    return {
        restrict: 'E',
        replace: true,
        transclude: true,
        template: `<div class="gr-panelled-content"><ng:transclude></ng:transclude></div>`
    };
}]);
