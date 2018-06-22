import angular from 'angular';

import template from './gr-toggle-button.html';

export const toggleButton = angular.module('gr.toggleButton', []);

toggleButton.directive('grToggleButton', [function() {
    return {
        restrict: 'E',
        template: template,
        scope: {
            name: '@grName',
            icon: '@grIcon',
            toggleVar: '=grToggle'
        },
        link: function(scope) {

            const setName = function() {
                scope.showHide = scope.toggleVar ? 'Hide' : 'Show';
            };

            scope.toggle = function() {
                scope.toggleVar = !scope.toggleVar;
                setName();
            };

            setName();
        }
    };
}]);
