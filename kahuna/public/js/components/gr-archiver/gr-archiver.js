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

        ctrl.archivedState = 'unarchived';
        ctrl.archiving = false;

        $scope.$watchCollection(getImageArray, (images) => {
            const allArchived = images.every(imageAccessor.isArchived);
            ctrl.archivedState = allArchived ? 'archived' : 'unarchived';
        });

        ctrl.archive = () => {
            ctrl.archiving = true;
            archiveService.batchArchive(getImageArray())
                .finally(() => {
                    ctrl.archiving = false;
                });
        };

        ctrl.unarchive = () => {
            ctrl.archiving = true;
            archiveService.batchUnarchive(getImageArray())
                .finally(() => {
                    ctrl.archiving = false;
                });
        };

        function getImageArray() {
            // Convert from Immutable Set to JS Array
            return Array.from(ctrl.images);
        }
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
