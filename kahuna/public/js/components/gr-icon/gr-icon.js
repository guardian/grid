import angular from 'angular';
import './gr-icon.css!';

export var icon = angular.module('grIcon', []);

icon.directive('grIcon', [function() {
    return {
        restrict: 'E',
        transclude: 'replace',
        template: `<i class="gr-icon" ng:class="{'gr-icon--small': grSmall}" ng:transclude></i>`,
        link: function (scope, element, attrs) {
            if (angular.isDefined(attrs.grSmall)) {
                scope.grSmall = true;
            }
        }
    };
}]);
