import angular from 'angular';

import template from './image.html!text';

export var image = angular.module('kahuna.preview.image', []);

image.directive('uiPreviewImage', function() {
    return {
        restrict: 'E',
        scope: {
            image: '=',
            hideInfo: '='
        },
        template: template
    };
});
