import angular from 'angular';

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
    '$window',
    'archiveService',
    'imageAccessor',
    function ($scope,
              $window,
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
                .catch(() => {
                    $window.alert('Failed to keep in Library, please try again.');
                })
                .finally(() => {
                    ctrl.archiving = false;
                });
        };

        ctrl.unarchive = () => {
            ctrl.archiving = true;
            archiveService.batchUnarchive(getImageArray())
                .catch(() => {
                    $window.alert('Failed to remove from Library, please try again.');
                })
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
