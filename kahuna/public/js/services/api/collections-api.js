import angular from 'angular';
import {mediaApi} from './media-api';
import {imageAccessor} from '../image-accessor';
import {async} from '../../util/async';

export var collectionsApi = angular.module('kahuna.services.api.collections', [
    mediaApi.name,
    imageAccessor.name,
    async.name
]);

collectionsApi.factory('collections',
                       ['$rootScope', '$q', 'mediaApi', 'imageAccessor', 'apiPoll',
                        function ($rootScope, $q, mediaApi, imageAccessor, apiPoll) {

    const collectionsRoot = mediaApi.root.follow('collections');

    // TODO: Rx?
    let collections;

    function getCollections() {
        // TODO: do we want to memoize? what if we want to reload?
        if (! collections) {
            collections = collectionsRoot.follow('collections').get();
        }
        return collections;
    }

    function removeCollection(collection) {
        return collection.perform('delete');
    }

    function addCollection(newCollectionPath) {
        return collectionsRoot.post({data: newCollectionPath});
    }

    function addChildTo(node, childName) {
        return node.perform('add-child', {body: {data: childName}}).then(childResource => {
            const updatedChildren = [childResource].concat(node.data.children).sort((a, b) => {
                if (a.data.basename.toLowerCase() < b.data.basename.toLowerCase()) {
                    return -1;
                }
                if (a.data.basename.toLowerCase() > b.data.basename.toLowerCase()) {
                    return 1;
                }
                return 0;
            });

            node.data.children = updatedChildren;

            return updatedChildren;
        });
    }

    function isDeletable(node) {
        return node.getAction('remove').then(angular.isDefined);
    }

    function removeFromList(child, list) {
        return child.perform('remove').then(() => {
            // Mutating the array p_q
            const i = list.indexOf(child);
            list.splice(i, 1);
        });
    }

    /*
     * @param Array<string> imageIds
     * @param Array<string> collectionPath
     */
    function addToCollectionUsingImageIds(imageIds, path) {
        // TODO: This isn't the most efficient way of doing this, but because we get the image data
        // from the drop data, this was the easiest way to do it without turning the JSON string
        // into a Resource object.
        const promises = imageIds.map(id => mediaApi.find(id)
            .then(image => addCollectionToImage(image, path))
        );

        return $q.all(promises);
    }

    function addToCollectionUsingImageResources(images, path) {
        const promises = images.map(image =>
            addCollectionToImage(image, path)
        ).toJS();

        return $q.all(promises);
    }

    function addCollectionToImage(image, path) {
        return image.perform('add-collection', {body: {data: path}})
            .then(collectionAdded => apiPoll(() =>
                untilNewCollectionAppears(image, collectionAdded)
            ))
            .then(newImage => {
              $rootScope.$emit('images-updated', [newImage]);
            });
    }

    function untilNewCollectionAppears(image, collectionAdded) {
        return image.get().then( (apiImage) => {
            const apiCollections = imageAccessor.getCollectionsIds(apiImage);
            if (collectionAdded.data && apiCollections.indexOf(collectionAdded.data.pathId) > -1) {
                return apiImage;
            } else {
                return $q.reject();
            }
        });
    }

    function collectionsEquals(collectionsA, collectionsB) {
        return angular.equals(
            collectionsA.sort(),
            collectionsB.sort()
        );
    }

    function getCollectionsIdsFromCollection(imageCollections) {
        return imageCollections.data.map(col => col.pathId);
    }

    function untilCollectionsEqual(image, expectedCollections) {
        return image.get().then(apiImage => {
            const apiCollections = imageAccessor.getCollectionsIds(apiImage);
            if (collectionsEquals(apiCollections, expectedCollections)) {
                return apiImage;
            } else {
                return $q.reject();
            }
        });
    }

    function removeImageFromCollection(collection, image) {
        return collection.perform('remove')
            .then(newImageCollections => apiPoll(() =>
                untilCollectionsEqual(image, getCollectionsIdsFromCollection(newImageCollections))
            ))
            .then(newImage => {
              $rootScope.$emit('images-updated', [newImage]);
                return newImage;
            });
    }

    function filterCollectionResource(image, collectionToMatch){
        return image.data.collections.filter(collection => {
            return collection.data && collection.data.pathId === collectionToMatch;
        });
    }

    function getCollectionToRemove(image, collection) {
        const filteredCollections = filterCollectionResource(image, collection);
        if (filteredCollections.length > 0){
            return filteredCollections[0];
        }
    }

    function batchRemove(images, collection) {
        const promises = images.map(image => {
            const collectionToRemove = getCollectionToRemove(image, collection);
            if (collectionToRemove) {
                return removeImageFromCollection(collectionToRemove, image);
            } else {
                //if image doesn't have the chosen collection it returns the image
                return image;
            }
        }).toJS();

        return $q.all(promises);
    }

    return {
        getCollections,
        removeCollection,
        addCollection,
        addChildTo,
        isDeletable,
        removeFromList,
        addToCollectionUsingImageIds,
        addToCollectionUsingImageResources,
        addCollectionToImage,
        removeImageFromCollection,
        batchRemove
    };
}]);
