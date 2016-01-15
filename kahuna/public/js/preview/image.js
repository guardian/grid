import angular from 'angular';

import '../util/rx';

import '../analytics/track';

import template from './image.html!text';

import '../image/service';
import '../services/image/usages';
import '../components/gr-add-label/gr-add-label';
import '../components/gr-image-persist-status/gr-image-persist-status';
import '../util/collections';

import {getCollection} from '../search-query/query-syntax';

export var image = angular.module('kahuna.preview.image', [
    'gr.image.service',
    'gr.image-usages.service',
    'analytics.track',
    'gr.addLabel',
    'gr.imagePersistStatus',
    'util.rx'
]);

image.controller('uiPreviewImageCtrl', [
    '$scope',
    'inject$',
    '$rootScope',
    '$window',
    'imageService',
    'imageUsagesService',
    'collectionsEnabled',
    function (
        $scope,
        inject$,
        $rootScope,
        $window,
        imageService,
        imageUsagesService,
        collectionsEnabled) {
    var ctrl = this;

    const freeUpdateListener = $rootScope.$on('image-updated', (e, updatedImage) => {
        if (ctrl.image.data.id === updatedImage.data.id) {
            ctrl.states = imageService(updatedImage).states;
            ctrl.image = updatedImage;
        }

    });

    // TODO: Remove this once we're happy with the collections panel
    ctrl.showCollections = collectionsEnabled;

    ctrl.states = imageService(ctrl.image).states;

    const hasPrintUsages$ =
        imageUsagesService.getUsages(ctrl.image).hasPrintUsages$;

    const hasDigitalUsages$ =
        imageUsagesService.getUsages(ctrl.image).hasDigitalUsages$;

    $scope.$on('$destroy', function() {
        freeUpdateListener();
    });

    inject$($scope, hasPrintUsages$, ctrl, 'hasPrintUsages');
    inject$($scope, hasDigitalUsages$, ctrl, 'hasDigitalUsages');
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
