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
      const hasRights = !(Object.keys(image.data.usageRights).length === 0);
      const cost = image.data.cost;
        return {
            cost,
            hasCrops: image.data.exports && image.data.exports.length > 0,
            hasRights,
            costState: hasRights ? cost : "no_rights",
            isValid: image.data.valid,
            canDelete: imageLogic.canBeDeleted(image),
            canArchive: imageLogic.canBeArchived(image),
            persistedReasons: imageLogic.getPersistenceExplanation(image).join('; '),
            isStaffPhotographer: imageLogic.isStaffPhotographer(image),
            syndicationStatus: imageLogic.getSyndicationStatus(image),
            syndicationReason: imageLogic.getSyndicationReason(image),
            hasSyndicationRights: imageLogic.hasSyndicationRights(image),
            hasRightsAcquiredForSyndication: imageLogic.hasRightsAcquiredForSyndication(image)
        };
    }

    return image => forImage(image);
}]);
