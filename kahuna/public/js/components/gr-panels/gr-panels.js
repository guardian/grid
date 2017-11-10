import angular from 'angular';
import Rx from 'rx';
import 'rx-dom';

import './gr-panels.css';
import {panelService} from '../../services/panel';
import {rxUtil} from '../../util/rx';
import {eq} from '../../util/eq';
import {rememberScrollTop} from '../../directives/gr-remember-scroll-top';

export const panels = angular.module('gr.panels', [
    panelService.name,
    rxUtil.name,
    eq.name,
    rememberScrollTop.name
]);

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
    return {
        restrict: 'E',
        replace: true,
        transclude: true,
        scope: {
            panel: '=grPanel',
            left: '=?grLeft',
            right: '=?grRight',
            rememberScroll: '=?grRememberScroll'
        },
        template:
            `<div class="gr-panel" ng:class="{'gr-panel--locked': state.locked}">
                <div class="gr-panel__content gr-panel-height"
                     ng:class="{
                        'gr-panel__content--hidden': state.hidden,
                        'gr-panel__content--left': left,
                        'gr-panel__content--right': right
                     }"
                     gr:remember-scroll-top="rememberScroll">
                    <ng:transclude></ng:transclude>
                </div>
            </div>`,
        link: function(scope) {
            const panel = scope.panel;
            const winScroll$ = Rx.DOM.fromEvent($window, 'scroll');

            inject$(scope, panel.state$, scope, 'state');

            // If we are quickly window scrolling whilst visible and unlocked
            const scrollWhileVisAndUnlocked$ = winScroll$.
                debounce(100).
                windowWithCount(2).
                withLatestFrom(panel.state$,
                    (ev, state) => !(state.locked || state.hidden)
                ).filter(shouldHide => shouldHide);

            // Then hide the panel
            subscribe$(scope, scrollWhileVisAndUnlocked$, () => {
                scope.$apply(() => panel.setHidden(true));
            });
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
