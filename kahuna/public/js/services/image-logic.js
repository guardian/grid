import angular from 'angular';

import '../services/image-accessor';

export const imageLogic = angular.module('kahuna.services.image-logic', [
    'kahuna.services.image-accessor'
]);

/**
 * Helpers to apply business logic on image resources.
 */
imageLogic.factory('imageLogic', ['imageAccessor', function(imageAccessor) {

    function canBeDeleted(image) {
        return image.getAction('delete').then(action => !! action);
    }

    function canBeArchived(image) {
        const persistReasons = imageAccessor.readPersistedReasons(image);
        return ! imageAccessor.isPersisted(image) ||
            (persistReasons.length === 1 && persistReasons[0] === 'archived');
    }

    function getArchivedState(image) {
        const cannotBeArchived = ! canBeArchived(image);
        const isPersisted = imageAccessor.isPersisted(image);
        return cannotBeArchived ? 'kept' :
               isPersisted ? 'archived' : 'unarchived';
    }

    function getPersistenceExplanation(image) {
        const persistReasons = imageAccessor.readPersistedReasons(image);
        return persistReasons.map(reason => {
            switch (reason) {
            case 'exports':
                return 'cropped';
            case 'persistence-identifier':
                return 'from Picdar';
            case 'photographer-category':
                return 'categorised as photographer';
            case 'illustrator-category':
                return 'categorised as illustrator';
            case 'commissioned-agency':
                return 'categorised as agency commissioned';
            default:
                return reason;
            }
        });
    }

    return {
        canBeDeleted,
        canBeArchived,
        getArchivedState,
        getPersistenceExplanation
    };
}]);

export default imageLogic;
