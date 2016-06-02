import angular from 'angular';

import template from './gr-toggle-button.html!text';

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

            scope.trackingName = 'Toggle Button';
            scope.trackingData = action => ({
                'Toggle name': scope.name,
                'Action': action
            });

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
