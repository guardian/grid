import angular from 'angular';
import Rx from 'rx';

import './gr-archiver.css!';
import template from './gr-archiver.html!text';

import '../../services/archive';
import '../../services/image-accessor';


export const module = angular.module('gr.archiver', [
    'kahuna.services.archive',
    'kahuna.services.image-accessor'
]);

module.controller('grArchiverCtrl', [
    '$scope',
    'archiveService',
    'imageAccessor',
    function ($scope,
              archiveService,
              imageAccessor) {

        const ctrl = this;

        $scope.$watchCollection(() => ctrl.images.toJS(), (images) => {
            const allArchived = images.every(imageAccessor.isArchived);
            ctrl.archivedState = allArchived ? 'archived' : 'unarchived';
        });

        ctrl.archive = () => {
            ctrl.archiving = true;
            var imageArray = Array.from(ctrl.images);
            archiveService.batchArchive(imageArray)
                .then(() => {
                    ctrl.archiving = false;
                });
        };

        ctrl.unarchive = () => {
            ctrl.archiving = true;
            var imageArray = Array.from(ctrl.images);
            archiveService.batchUnarchive(imageArray)
                .then(() => {
                    ctrl.archiving = false;
                });
        };
    }
]);

module.directive('grArchiver', [function () {
    return {
        restrict: 'E',
        template: template,
        scope: {
            images: '=grImages'
        },
        controller: 'grArchiverCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    };
}]);
