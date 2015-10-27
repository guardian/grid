import angular from 'angular';

import '../../image/service';
import '../../edits/ui-archiver/archiver';

import template from './gr-image-persist-status.html!text';
import './gr-image-persist-status.css!';

export let module = angular.module('gr.imagePersistStatus', [
    'gr.image.service',
    'kahuna.edits.archiver'
]);

module.controller('GrImagePersistStatusCtrl', [
    '$rootScope',
    '$scope',
    'imageService',
    function (
        $rootScope,
        $scope,
        imageService) {

        let ctrl = this;

        ctrl.states = imageService(ctrl.image).states;

        const freeUpdateListener = $rootScope.$on('image-updated', (e, updatedImage) => {
            if (ctrl.image.data.id === updatedImage.data.id) {
                ctrl.states = imageService(updatedImage).states;
                ctrl.image = updatedImage;
            }
        });

        $scope.$on('$destroy', freeUpdateListener);
    }
]);

module.directive('grImagePersistStatus', [function () {
    return {
        restrict: 'E',
        controller: 'GrImagePersistStatusCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template,
        scope: {
            image: '=grImage',
            disabled: '=',
            withText: '='
        }
    };
}]);
