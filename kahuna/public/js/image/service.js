import angular from 'angular';

import '../edits/service';

export const imageService = angular.module('gr.image.service', ['kahuna.edits.service']);

imageService.factory('imageService', ['editsService', function(editsService) {
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
            canDelete: image.getAction('delete').then(action => !! action)
        };
    }

    return image => forImage(image);
}]);
