import apiServices from '../api';

apiServices.factory('collections', ['mediaApi', function (mediaApi) {
    // TODO: Rx?
    let collections;

    function getCollections() {
        if(! collections) {
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
        node.perform('add-child', {body: {data: childName}}).then(childResource => {
            node.data.children = [childResource].concat(node.data.children);
        });
    }

    function isDeletable(node) {
        return node.getAction('remove').then(d => angular.isDefined(d));
    }

    function remove(node) {
        return node.perform('remove');
    }

    return {
        getCollections,
        removeCollection,
        addCollection,
        addChildTo,
        isDeletable
    };
}]);
