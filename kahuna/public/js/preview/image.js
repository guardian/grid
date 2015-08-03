import angular from 'angular';
import '../analytics/track';

import template from './image.html!text';

import '../image/service';

export var image = angular.module('kahuna.preview.image', [
    'gr.image.service',
    'analytics.track'
]);

image.controller('uiPreviewImageCtrl', [
    '$scope',
    '$rootScope',
    'imageService',
    function (
        $scope,
        $rootScope,
        imageService) {
    var ctrl = this;

    const freeUpdateListener = $rootScope.$on('image-updated', (e, updatedImage) => {
        if (ctrl.image.data.id === updatedImage.data.id) {
            ctrl.states = imageService(updatedImage).states;
            ctrl.image = updatedImage;
        }

    });

    ctrl.states = imageService(ctrl.image).states;

    $scope.$on('$destroy', function() {
        freeUpdateListener();
    });
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
