import angular from 'angular';

import template from './preview.html!text';

export var preview = angular.module('kahuna.image.preview', []);

preview.directive('uiPreview', function() {
    return {
        restrict: 'E',
        scope: {
            image: '=',
            hideInfo: '='
        },
        template: template
    };
});
