import angular from 'angular';
import './gr-icon.css!';

import frontendIcon from './frontend.html!text';
import composerIcon from './composer.html!text';

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

icon.directive('grIconLabel', [function () {
    return {
        restrict: 'E',
        scope: {
            grIcon: '@'
        },
        transclude: 'replace',
        template: `
            <gr-icon>{{grIcon}}</gr-icon>
            <span class="icon-label"><ng:transclude></ng:transclude></span>`
    };
}]);

icon.directive('grFrontendIcon', [function () {
    return {
        restrict: 'E',
        transclude: 'replace',
        template: frontendIcon
    };
}]);

icon.directive('grComposerIcon', [function () {
    return {
        restrict: 'E',
        transclude: 'replace',
        template: composerIcon
    };
}]);
