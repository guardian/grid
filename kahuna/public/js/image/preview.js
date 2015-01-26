import angular from 'angular';

import template from './preview.html!text';

export var preview = angular.module('kahuna.image.preview', []);

preview.controller('PreviewCtrl', function() {});

preview.directive('uiPreview', function() {
    return {
        restrict: 'E',
        controller: 'PreviewCtrl as ctrl',
        scope: {
            image: '=',
            abbr: '='
        },
        bindToController: true,
        template: template
    };
});
