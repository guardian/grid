import angular from 'angular';

import '../edits/service';

export const imageService = angular.module('gr.image.service', ['kahuna.edits.service']);

imageService.factory('imageService', [function() {
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
                default:
                    return reason;
            }
        });

        return {
            cost: image.data.cost,
            hasCrops: image.data.exports && image.data.exports.length > 0,
            isValid: image.data.valid,
            canDelete: image.getAction('delete').then(action => !! action),
            canArchive: image.data.persisted.value === false ||
                (persistReasons.length === 1 && persistReasons[0] === 'archived'),
            persistedReasons: persistReasons.join('; ')
        };
    }

    return image => forImage(image);
}]);
