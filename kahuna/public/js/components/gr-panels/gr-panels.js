import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import './gr-panels.css!';
import '../../services/panel';
import '../../util/rx';
import '../../util/eq';

export const panels = angular.module('gr.panels', ['kahuna.services.panel', 'util.rx', 'util.eq']);

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

panels.directive('grPanel', ['$timeout', '$window', 'inject$', 'subscribe$',
                             function($timeout, $window, inject$, subscribe$) {

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
            panel: '=grPanel',
            left: '=?grLeft',
            right: '=?grRight'
        },
        template:
            `<div class="gr-panel" ng:class="{
                'gr-panel--locked': state.locked }">
                {{ctrl.state}}
                <div class="gr-panel__content"
                     ng:class="{
                        'gr-panel__content--hidden': state.hidden,
                        'gr-panel__content--left': left,
                        'gr-panel__content--right': right
                     }"
                     gr:panel-height>
                    <ng:transclude></ng:transclude>
                </div>
            </div>`,
        link: function(scope, element) {
            function setElementHeight() {
                setFullHeight(element);
                scope.panelHeight = element.height();
            }
            const panel = scope.panel;
            const winResize$ = Rx.DOM.fromEvent($window, 'resize');
            // This is done to make sure we trigger on the template being rendered,
            // if we don't we get the semi-rendered template offset
            $timeout(setElementHeight, 0);

            inject$(scope, panel.state$, scope, 'state');

            // Reset the panel heights
            subscribe$(scope, winResize$.debounce(500), setElementHeight);
        }
    };
}]);

panels.directive('grPanelHeight', ['onValChange', function(onValChange) {
    return {
        restrict: 'A',
        link: function(scope, element) {
            scope.$watch('panelHeight', onValChange(height => {
                element.height(height);
            }));
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
