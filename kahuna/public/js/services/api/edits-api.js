import apiServices from '../api';

apiServices.factory('editsApi', ['mediaApi', function(mediaApi) {

    var root;

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
        // FIXME: this shouldn't be returning the response, but we need some
        // updated theseus juice here
        return getMetadata(id).then(r => r.put({ data: metadata }).response);
    }

    return {
        updateMetadata: updateMetadata
    };
}]);
