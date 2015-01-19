import apiServices from '../api';

apiServices.factory('editsApi', ['$q', 'mediaApi', function($q, mediaApi) {

    var root;
    var updatedMetadataDefs = new Map();

    function getRoot() {
        return root || (root = mediaApi.root.follow('metadata'));
    }

    function getEdits(id) {
        return getRoot().follow('metadata', { id }).getResponse();
    }

    function getMetadata(id) {
        return getEdits(id).then(r => r.data.metadata);
    }

    function updateMetadata(id, metadata) {
        // FIXME: this shouldn't be returning the response and ID, but we need some
        // updated theseus juice here to be able to return the `Resource` correctly
        return getMetadata(id)
            .then(resource => resource.put({ data: metadata }))
            .then(resource => {
                updatedMetadataDefs.forEach(def => def.notify({ resource, metadata, id }));
                return resource;
            })
            .catch(e => updatedMetadataDefs.forEach(def => def.reject(e)));
    }

    function onMetadataUpdate(onupdate, failure) {
        var def = $q.defer();
        def.promise.then(() => {}, failure, onupdate);
        updatedMetadataDefs.set(onupdate, def);

        return () => offMetadataUpdate(onupdate);
    }

    function offMetadataUpdate(onupdate) {
        return updatedMetadataDefs.delete(onupdate);
    }

    return {
        updateMetadata: updateMetadata,
        onMetadataUpdate: onMetadataUpdate,
        offMetadataUpdate: offMetadataUpdate
    };
}]);
