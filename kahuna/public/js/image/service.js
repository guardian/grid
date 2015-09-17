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

    function hasExportsOfType(image, type) {
        return image.data.exports &&
                image.data.exports.some(ex => ex.type === type);
    }

    function getStates(image) {
        return {
            cost: image.data.cost,
            hasCrops: hasExportsOfType(image, 'crop'),
            isValid: image.data.valid,
            canDelete: image.getAction('delete').then(action => !! action),
            canArchive: image.data.persisted.value === false ||
                (image.data.persisted.reasons.length === 1 && image.data.persisted.reasons[0] === "archived"),
            persistedReasons: image.data.persisted.reasons.join(', ')
        };
    }

    return image => forImage(image);
}]);
