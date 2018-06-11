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
        return {
            cost: image.data.cost,
            hasCrops: image.data.exports && image.data.exports.length > 0,
            hasRights: !Boolean(Object.keys(image.data.usageRights).length === 0),
            isValid: image.data.valid,
            canDelete: imageLogic.canBeDeleted(image),
            canArchive: imageLogic.canBeArchived(image),
            persistedReasons: imageLogic.getPersistenceExplanation(image).join('; '),
            isStaffPhotographer: imageLogic.isStaffPhotographer(image),
            isSyndicated: imageLogic.isSyndicated(image)
        };
    }

    return image => forImage(image);
}]);
