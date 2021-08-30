import angular from 'angular';
import {Set} from 'immutable';

import './gr-archiver.css';
import template from './gr-archiver.html';

import '../../services/archive';
import '../../services/image-accessor';
import '../../util/string';


export const module = angular.module('gr.archiver', [
    'kahuna.services.archive',
    'kahuna.services.image-accessor',
    'kahuna.services.image-logic',
    'util.string'
]);

module.controller('grArchiverCtrl', [
    '$scope',
    '$window',
    'archiveService',
    'imageAccessor',
    'imageLogic',
    'humanJoin',
    'mediaApi',
    function ($scope,
              $window,
              archiveService,
              imageAccessor,
              imageLogic,
              humanJoin,
              mediaApi) {

        const ctrl = this;

        ctrl.archivedState = 'unarchived';
        ctrl.archiving = false;
        ctrl.canArchive = false;

        ctrl.canUndelete = false;
        ctrl.isDeleted = false;

        ctrl.undelete = undelete;

        mediaApi.getSession().then(session => {
            if (ctrl.image.data.softDeletedMetadata !== undefined && session.user.permissions.canDelete) { ctrl.canUndelete = true; }
            if (ctrl.image.data.softDeletedMetadata !== undefined) { ctrl.isDeleted = true; }
        });

        mediaApi.canUserArchive().then(canArchive => {
            ctrl.canArchive = canArchive;
        });

        $scope.$watchCollection(getImageArray, (images) => {
            const noneCanBeArchived = ! images.some(imageLogic.canBeArchived);
            const allPersisted = images.every(imageAccessor.isPersisted);
            ctrl.archivedState = noneCanBeArchived ? 'kept' :
                allPersisted ? 'archived' : 'unarchived';

            const explTokens = listAllPersistenceExplanations(images);
            let explanation, reason;
            if (images.length === 1) {
                reason = humanJoin(explTokens, 'and');
                explanation = `Kept in Library because the image has been ${reason}.`;
            } else {
                reason = humanJoin(explTokens, 'or');
                explanation = `Kept in Library because the images have been ${reason}.`;
            }
            ctrl.archivedExplanation = explanation;
        });

        ctrl.archive = () => {
            ctrl.archiving = true;
            archiveService.batchArchive(getImageArray())
                .catch(() => {
                    $window.alert('Failed to add to Library, please try again.');
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
            if (ctrl.images && ! ctrl.image) {
                // Convert from Immutable Set to JS Array
                return Array.from(ctrl.images);
            } else if (! ctrl.images && ctrl.image) {
                return [ctrl.image];
            } else {
                throw new Error('Either gr:images or gr:image should be provided ' +
                                'to gr-archiver directive');
            }
        }

        function listAllPersistenceExplanations(images) {
            return images.
                map(imageLogic.getPersistenceExplanation).
                map(items => new Set(items)).
                reduce((all, items) => all.union(items)).
                toArray();
        }
        function undelete() {
            const imageId = ctrl.image.data.id;
            mediaApi.undelete(imageId).then(
                ctrl.canUndelete = ctrl.isDeleted = false
            );
        }
    }
]);

module.directive('grArchiver', [function () {
    return {
        restrict: 'E',
        template: template,
        scope: {
            // Either is allowed, not both
            image: '=grImage',
            images: '=grImages'
        },
        controller: 'grArchiverCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    };
}]);
