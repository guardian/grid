import angular from 'angular';

import '../services/image-accessor';

const imageLogic = angular.module('kahuna.services.image-logic', [
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

    return {
        canBeDeleted,
        canBeArchived
    };
}]);

export default imageLogic;
