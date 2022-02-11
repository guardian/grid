import angular from 'angular';
import './gr-top-bar.css';
import template from './gr-top-bar.html';

export var topBar = angular.module('gr.topBar', []);

topBar.directive('grTopBar', [function() {
    return {
        restrict: 'E',
        transclude: 'replace',
        scope: {
            fixed: '='
        },
        template: `<ng:transclude class="gr-top-bar-inner"
                                  ng:class="{'gr-top-bar-inner--fixed': fixed}">
                   </ng:transclude>`
    };
}]);

topBar.directive('grTopBarNav', [function() {
    return {
        restrict: 'E',
        transclude: true,
        // Annoying to have to hardcode root route here, but only
        // way I found to clear $stateParams from uiRouter...
        template: `${window._clientConfig.homeLinkHtml || template }
                   <ng:transclude></ng:transclude>`
    };
}]);

topBar.directive('grTopBarActions', [function() {
    return {
        restrict: 'E',
        transclude: true,
        // Always have user actions at the end of actions
        template: `<ng:transclude></ng:transclude>
                   <ui-user-actions></ui-user-actions>`
    };
}]);
