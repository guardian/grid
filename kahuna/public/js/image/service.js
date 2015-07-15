import angular from 'angular';

import '../edits/service';

export const imageService = angular.module('gr.image.service', ['kahuna.edits.service']);

imageService.factory('imageService', ['editsService', function(editsService) {
    function forImage(image) {
        return {
            usageRights: usageRights(image)
        };
    }

    function usageRights(image) {
        // we override the data with the overrides data from the edits API.
        const data = angular.extend({}, image.data.usageRights, image.data.userMetadata.data.usageRights.data);
        const resource = image.data.userMetadata.data.usageRights;

        const save = newData => editsService.update(resource, newData, image);
        const remove = () => editsService.remove(resource, image);

        return { data, resource, image, save, remove };
    }


    return image => forImage(image);
}]);
