import angular from 'angular';

const imageAccessor = angular.module('kahuna.services.image-accessor', []);

/**
 * Accessor helpers to read information out of image resources.
 */
imageAccessor.factory('imageAccessor', function() {

    /* == Extractors ==  (return embedded Resources) */

    function extractUserMetadata(image) {
        return image.data.userMetadata;
    }


    /* == Readers ==  (return data) */

    function readCost(image) {
        return image.data.cost;
    }

    function readLabels(image) {
        const userMetadata = extractUserMetadata(image);
        return userMetadata.data.labels.data;
    }

    function readMetadata(image) {
        return image.data.metadata;
    }

    function readUsageRights(image) {
        return image.data.usageRights;
    }

    function isArchived(image) {
        const userMetadata = extractUserMetadata(image);
        return userMetadata.data.archived.data;
    }

    return {
        readCost,
        readLabels,
        readMetadata,
        readUsageRights,
        isArchived
    };
});

export default imageAccessor;
