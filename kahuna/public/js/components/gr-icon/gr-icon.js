import angular from 'angular';
import './gr-icon.css!';

export var icon = angular.module('grIcon', []);

icon.directive('grIcon', [function() {
    return {
        restrict: 'E',
        transclude: 'replace',
        scope: {
            small: '='
        },
        template: `<i class="gr-icon" ng:class="{'gr-icon--small': small}" ng:transclude></i>`
    };
}]);
