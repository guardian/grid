import angular from 'angular';

import apiServices from '../api';

apiServices.factory('mediaApi',
                    ['mediaApiUri', 'theseus.client',
                     function(mediaApiUri, client) {

    var root = client.resource(mediaApiUri);
    var session;

    function search(query = '', {ids, since, until, archived, valid,
                                 free, uploadedBy, offset, length, orderBy} = {}) {
        return root.follow('search', {
          q:          query,
          ids:        ids,
          since:      since,
          until:      until,
          uploadedBy: uploadedBy,
          valid:      valid,
          archived:   archived,
          free:       free,
          offset:     offset,
          length:     angular.isDefined(length) ? length : 50,
          orderBy:    orderBy === 'oldest' ? 'uploadTime' : '-uploadTime'
        }).get();
    }

    function find(id) {
        // FIXME: or use lazy resource?
        return root.follow('image', {id: id}).get();
    }

    function getSession() {
        // TODO: workout how we might be able to memoize this function but still
        // play nice with changes that might occur in the API (cache-header?).
        return session || (session = root.follow('session').getData());
    }

    function metadataSearch(field, { q }) {
        return root.follow('metadata-search', { field, q }).get();
    }

    function labelSearch({ q }) {
        return root.follow('label-search', { q }).get();
    }

    function labelsSuggest({ q }) {
        return root.follow('suggested-labels', { q }).get();
    }

    function delete_(image) {
        return image.perform('delete');
    }

    return {
        root,
        search,
        find,
        getSession,
        metadataSearch,
        labelSearch,
        labelsSuggest,
        delete: delete_
    };
}]);
