import angular from 'angular';

import '../services/image-logic';

export const imageService = angular.module('gr.image.service', [
    'kahuna.services.image-logic'
]);

imageService.factory('imageService', ['imageLogic', function(imageLogic) {
    function forImage(image) {
        return {
            usageRights: usageRights(image),
            states: getStates(image)
        };
    }

    function usageRights(image) {
        return {
            image: image,
            data: image.data.usageRights
        };
    }

    function getStates(image) {
        const persistReasons = image.data.persisted.reasons.map(reason => {
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

        return {
            cost: image.data.cost,
            hasCrops: image.data.exports && image.data.exports.length > 0,
            isValid: image.data.valid,
            canDelete: imageLogic.canBeDeleted(image),
            canArchive: imageLogic.canBeArchived(image),
            persistedReasons: persistReasons.join('; ')
        };
    }

    return image => forImage(image);
}]);
