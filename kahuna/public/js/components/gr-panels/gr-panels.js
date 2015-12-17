import angular from 'angular';
import './gr-panels.css!';

export const panels = angular.module('gr.panels', []);

panels.directive('grPanels', [function() {
    return {
        restrict: 'E',
        replace: true,
        transclude: true,
        template: `<div class="panels">
            <div class="panels-content" ng:transclude></div>
        </div>`
    };
}]);

panels.directive('grPanel', ['$timeout', function($timeout) {

    function setFullHeight(element) {
        const offset = element.position().top;
        const height = `calc(100vh - ${offset}px)`;

        console.log(offset);
        element.css({ height });
    }

    return {
        restrict: 'E',
        replace: true,
        transclude: true,
        scope: {
            left: '=?grLeft',
            right: '=?grRight',
            hidden: '=?grHidden'
        },
        template:
            `<div class="panel" ng:class="{
                'panel--left': left,
                'panel--right': right,
                'panel--hidden': hidden,
                'panel--locked': locked }">
                <button class="panel__hide" ng:click="hidden = !hidden"><gr-icon>close</gr-icon></button>
                <button class="panel__lock" ng:click="locked = !locked"><gr-icon>lock</gr-icon></button>
                <div class="panel__content">
                    <ng:transclude></ng:transclude>
                </div>
            </div>`,
        link: function(_, element) {
            // This is done to make sure we trigger on the template being rendered,
            // if we don't we get the semirendered template offset
            $timeout(() => setFullHeight(element), 0);
        }
    };
}]);

panels.directive('grPanelContent', [function() {
    return {
        restrict: 'E',
        replace: true,
        transclude: true,
        template: `<div class="panelled-content"><ng:transclude></ng:transclude></div>`
    };
}]);
