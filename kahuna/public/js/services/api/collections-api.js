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

    return {
        getCollections,
        removeCollection,
        addCollection,
        addChildTo,
        isDeletable,
        removeFromList
    };
}]);
