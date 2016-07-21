import angular from 'angular';

import template from './gr-metadata-validity.html!text';

export const module = angular.module('gr.metadataValidity', []);

module.directive('grMetadataValidity', [function () {
    return {
        restrict: 'E',
        template: template,
        transclude: true,
        scope: {
            image: '=grImage'
        }
    };
}]);
