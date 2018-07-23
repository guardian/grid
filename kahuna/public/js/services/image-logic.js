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

    function isStaffPhotographer(image) {
        const staffCategories = [
            'staff-photographer',
            'contract-photographer',
            'commissioned-photographer'
        ];

        return image.data.usageRights &&
            staffCategories.includes(image.data.usageRights.category);
    }

    function getPersistenceExplanation(image) {
        const persistReasons = imageAccessor.readPersistedReasons(image);
        return persistReasons.map(reason => {
            switch (reason) {
            case 'exports':
                return 'cropped';
            case 'usages':
                return 'used';
            case 'persistence-identifier':
                return 'from Picdar';
            case 'photographer-category':
                return 'categorised as photographer';
            case 'illustrator-category':
                return 'categorised as illustrator';
            case 'commissioned-agency':
                return 'categorised as agency commissioned';
            case 'persisted-collection':
                return 'is in a persisted collection';
            case 'album':
                return 'is in an album';
            default:
                return reason;
            }
        });
    }

    function isSyndicated(image) {
        const syndicationRights = image.data.syndicationRights;

        const hasSyndicationRights = !!syndicationRights;

        if (!hasSyndicationRights) {
            return false;
        }

        return syndicationRights.rights.find(_ => _.acquired === true);
    }

    return {
        canBeDeleted,
        canBeArchived,
        getArchivedState,
        getPersistenceExplanation,
        isStaffPhotographer,
        isSyndicated
    };
}]);

export default imageLogic;
