import angular from 'angular';
import '../analytics/track';

import template from './image.html!text';

import '../image/service';
import '../components/gr-add-label/gr-add-label';
import '../components/gr-image-persist-status/gr-image-persist-status';

export var image = angular.module('kahuna.preview.image', [
    'gr.image.service',
    'analytics.track',
    'gr.addLabel',
    'gr.imagePersistStatus'
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

image.directive('grStopPropagation', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.on(attrs.grStopPropagation, e => e.stopPropagation());
        }
    };
});
