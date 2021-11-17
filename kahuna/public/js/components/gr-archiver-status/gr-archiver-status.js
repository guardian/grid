import angular from 'angular';
import template from './gr-archiver-status.html';
import './gr-archiver-status.css';

import {archiveService} from '../../services/archive';
import {imageLogic} from '../../services/image-logic';
import {string} from '../../util/string';

export const archiver = angular.module('gr.archiverStatus', [
    archiveService.name,
    imageLogic.name,
    string.name
]);

archiver.controller('ArchiverCtrl',
                    ['$scope', '$window', 'archiveService',
                     'imageLogic', 'humanJoin', 'mediaApi',
                     function($scope, $window, archiveService,
                              imageLogic, humanJoin, mediaApi) {

    const ctrl = this;

    ctrl.archive = archive;
    ctrl.unarchive = unarchive;
    ctrl.archiving = false;
    ctrl.canUndelete = false;

    ctrl.undelete = undelete;

    mediaApi.getSession().then(session => {
        if (ctrl.image.data.softDeletedMetadata !== undefined && (session.user.permissions.canDelete || session.user.email === ctrl.image.data.uploadedBy)) { ctrl.canUndelete = true; }
    });

    mediaApi.canUserArchive().then(canArchive => {
        ctrl.canArchive = canArchive;
    });

    $scope.$watch(() => ctrl.image, image => {
        ctrl.archivedState = imageLogic.getArchivedState(image);

        const explTokens = imageLogic.getPersistenceExplanation(image);
        ctrl.archivedExplanation = humanJoin(explTokens, 'and');
    });

    function archive() {
        return archivingFeedback(archiveService.archive(ctrl.image));
    }

    function unarchive() {
        return archivingFeedback(archiveService.unarchive(ctrl.image));
    }

    function archivingFeedback(promise) {
        ctrl.archiving = true;
        return promise.
            catch(()  => $window.alert('Failed to save the changes, please try again.')).
            finally(() => ctrl.archiving = false);
    }

    function undelete() {
        const imageId = ctrl.image.data.id;
        mediaApi.undelete(imageId).then(
            ctrl.canUndelete = ctrl.isDeleted = false
        );
    }
}]);

archiver.directive('grArchiverStatus', [function() {
    return {
        restrict: 'E',
        controller: 'ArchiverCtrl',
        controllerAs: 'ctrl',
        scope: {
            image: '=',
            isDeleted: '=',
            readonly: '='
        },
        bindToController: true,
        template: template
    };
}]);
