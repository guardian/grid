import angular from 'angular';
import {Map, Set} from 'immutable';

const imageList = angular.module('kahuna.services.image-list', []);

/**
 * Helper functions to operate on list of images.
 */
imageList.factory('imageList', ['imageAccessor', function(imageAccessor) {

    function countOccurrences(collection) {
        return collection.reduce((counts, item) => {
            const currentCount = counts.get(item) || 0;
            return counts.set(item, currentCount + 1);
        }, Map());
    }

    function occurrencesToTuple(counts) {
        return Array.from(counts.entries()).map(([data, count]) => {
            return {data, count};
        });
    }

    // TODO: a lot of these are boilerplate around imageAccessor, can
    // we use a library like Ramda to curry functions and pass them
    // directory to a stream of collections, e.g. s$.map(R.map(func)) ?

    function archivedCount(images) {
        return images.filter(imageAccessor.isArchived).size;
    }

    function getCost(images) {
        return images.map(imageAccessor.readCost);
    }

    function getLabels(images) {
        return images.
            flatMap(imageAccessor.readLabels).
            map(label => label.data);
    }

    function getMetadata(images) {
        return images.map(imageAccessor.readMetadata);
    }

    function getOccurrences(items) {
        const valueCounts = countOccurrences(items);
        return occurrencesToTuple(valueCounts);
    }

    function getSetOfProperties(objects) {
        const keys = objects.flatMap(Object.keys);
        return keys.reduce((propertySets, key) => {
            const valueSet = objects.reduce((values, obj) => {
                return values.add(obj[key]);
            }, Set());
            return propertySets.set(key, valueSet);
        }, Map());
    }

    return {
        archivedCount,
        getCost,
        getLabels,
        getMetadata,
        getOccurrences,
        getSetOfProperties
    };
}]);

export default imageList;
