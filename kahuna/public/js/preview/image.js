import angular from 'angular';
import '../analytics/track';

import template from './image.html!text';

import '../image/service';

export var image = angular.module('kahuna.preview.image', [
    'gr.image.service',
    'analytics.track'
]);

image.controller('uiPreviewImageCtrl', ['imageService', function (imageService) {
    var ctrl = this;

    ctrl.states = imageService(ctrl.image).states;
}]);

image.directive('uiPreviewImage', function() {
    return {
        restrict: 'E',
        scope: {
            image: '=',
            hideInfo: '=',
            selectionMode: '='
        },
        // extra actions can be transcluded in
        transclude: true,
        template: template,
        controller: 'uiPreviewImageCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    };
});
