import apiServices from '../api';

apiServices.factory('collections', ['mediaApi', function (mediaApi) {
    var collections;

    function getCollections() {
        if(! collections) {
            collections = mediaApi.root.follow('collections').getData();
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
