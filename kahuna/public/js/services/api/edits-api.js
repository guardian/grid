import apiServices from '../api';

apiServices.factory('editsApi', ['$q', 'mediaApi', function($q, mediaApi) {

    var root;
    var updatedMetadataDefs = [];

    function getRoot() {
        return root || (root = mediaApi.root.follow('metadata'));
    }

    function getEdits(id) {
        return getRoot().follow('metadata', { id }).getResponse();
    }

    function getMetadata(id) {
        return getEdits(id).then(r => r.data.metadata);
    }

    function getArchived(id) {
        return getEdits(id).then(r => r.data.archived);
    }

    function getLabels(id) {
        return getEdits(id).then(r => r.data.labels);
    }

    function updateMetadata(id, metadata) {
        // FIXME: this shouldn't be returning the response and ID, but we need some
        // updated theseus juice here to be able to return the `Resource` correctly
        return getMetadata(id).then(resource => resource.put({ data: metadata }))
                              .then(resource => {
                                  updatedMetadataDefs.forEach(def => def.notify({ resource, metadata, id }));
                                  return resource;
                              })
                              .catch(e => updatedMetadataDef.reject(e));
    }

    function onMetadataUpdate(onupdate, failure) {
        var def = $q.defer();
        def.promise.then(() => {}, failure, onupdate);
        updatedMetadataDefs.push(def);

        return def;
    }

    return {
        updateMetadata: updateMetadata,
        onMetadataUpdate: onMetadataUpdate
    };
}]);
