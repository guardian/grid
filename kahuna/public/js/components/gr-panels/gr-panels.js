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

panels.directive('grPanel', [function() {
    return {
        restrict: 'E',
        replace: true,
        transclude: true,
        scope: {
            left: '=?grLeft',
            right: '=?grRight'
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
            </div>`
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
