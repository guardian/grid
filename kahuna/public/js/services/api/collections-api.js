import apiServices from '../api';

apiServices.factory('collections', ['mediaApi', function (mediaApi) {
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

    return {
        getCollections,
        removeCollection,
        addCollection
    };
}]);
