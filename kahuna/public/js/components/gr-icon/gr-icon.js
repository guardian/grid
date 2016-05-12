import angular from 'angular';
import './gr-icon.css!';

import frontendIcon from './icons/frontend.svg!text';
import composerIcon from './icons/composer.svg!text';

import libraryAddIcon    from './icons/library-add.svg!text';
import libraryAddedIcon  from './icons/library-added.svg!text';
import libraryLockedIcon from './icons/library-locked.svg!text';
import libraryRemoveIcon from './icons/library-remove.svg!text';

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
            grIcon: '@',
            grLoading: '@'
        },
        transclude: 'replace',
        template: `
            <gr-icon ng-class="{'spin': grLoading === 'true'}">{{grIcon}}</gr-icon>
            <span class="icon-label"><ng:transclude></ng:transclude></span>`
    };
}]);

function defineIcon(name, template) {
    icon.directive(name, [function () {
        return {
            restrict: 'E',
            transclude: 'replace',
            template: template
        };
    }]);
}

defineIcon('grFrontendIcon', frontendIcon);
defineIcon('grComposerIcon', composerIcon);

defineIcon('grLibraryAddIcon',    libraryAddIcon);
defineIcon('grLibraryAddedIcon',  libraryAddedIcon);
defineIcon('grLibraryLockedIcon', libraryLockedIcon);
defineIcon('grLibraryRemoveIcon', libraryRemoveIcon);
