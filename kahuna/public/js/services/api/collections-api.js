import angular from 'angular';
import apiServices from '../api';

apiServices.factory('collections', ['mediaApi', function (mediaApi) {
    // TODO: Rx?
    let collections;

    function getCollections() {
        if (! collections) {
            collections = mediaApi.root.follow('collections').get().
                then(collectionsService => collectionsService.follow('collections').get());
        }
        return collections;
    }

    function removeCollection(collection) {
        return collection.perform('delete');
    }

    function addCollection(newCollectionPath) {
        return mediaApi.root.follow('collections').post({data: newCollectionPath});
    }

    function addChildTo(node, childName) {
        return node.perform('add-child', {body: {data: childName}}).then(childResource => {
            // NOTE: The child will always be prepended, but the default view for the tree
            // is alphabetical, so this will change after reload.
            const updatedChildren = node.data.children = [childResource].concat(node.data.children);
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
    function addImageIdsToCollection(imageIds, path) {
        // TODO: This isn't the most efficient way of doing this, but because we get the image data
        // from the drop data, this was the easiest way to do it without turning the JSON string
        // into a Resource object.
        const promises = imageIds.map(id => mediaApi.find(id).then(
                image => image.perform('add-collection', {body: {data: path}})));

        return Promise.all(promises);
    }

    function addImagesToCollection(images, path) {
        const promises = images.map(image =>
            image.perform('add-collection', {body: {data: path}})
        ).toJS();

        return Promise.all(promises);
    }

    return {
        getCollections,
        removeCollection,
        addCollection,
        addChildTo,
        isDeletable,
        removeFromList,
        addImageIdsToCollection,
        addImagesToCollection
    };
}]);
