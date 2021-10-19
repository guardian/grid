import angular from 'angular';

export const imageAccessor = angular.module('kahuna.services.image-accessor', []);

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

    function readLeases(image) {
        return image.data.leases.data;
    }

    function readMetadata(image) {
        return image.data.metadata;
    }

    function readExtraInfo(image) {
        return {
            filename: image.data.uploadInfo && image.data.uploadInfo.filename,
            uploadedBy: image.data.uploadedBy
        };
    }

    function readUsageRights(image) {
        return image.data.usageRights;
    }

    function readPersistedReasons(image) {
        return image.data.persisted.reasons;
    }

    function isPersisted(image) {
        return image.data.persisted.value;
    }

    function isArchived(image) {
        const userMetadata = extractUserMetadata(image);
        return userMetadata.data.archived.data;
    }

    function readCollections(image) {
        return image.data.collections;
    }

    function readSyndicationStatus(image) {
        return image.data.syndicationStatus;
    }

    function getCollectionsIds(image) {
        const collections = readCollections(image);
        return collections.map(col => col.data.pathId);
    }

    function getPhotoshoot(image) {
        const userMetadata = extractUserMetadata(image);
        return userMetadata.data.photoshoot;
    }

    function getSyndicationRights(image) {
        return image.data.syndicationRights;
    }

    return {
        readCost,
        readLabels,
        readLeases,
        readMetadata,
        readExtraInfo,
        readUsageRights,
        readPersistedReasons,
        isPersisted,
        isArchived,
        readCollections,
        getCollectionsIds,
        getPhotoshoot,
        readSyndicationStatus,
        getSyndicationRights
    };
});

export default imageAccessor;
