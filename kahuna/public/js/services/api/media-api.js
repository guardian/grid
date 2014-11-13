import apiServices from 'services/api';

apiServices.factory('mediaApi',
                    ['mediaApiUri', 'theseus.Client',
                     function(mediaApiUri, client) {

    var root = client.resource(mediaApiUri);
    var session;

    function search(query = '', {ids, since, until, archived, valid, free, uploadedBy}) {
        return root.follow('search', {
          q:          query,
          ids:        ids,
          since:      since,
          until:      until,
          uploadedBy: uploadedBy,
          valid:      valid,
          archived:   archived,
          free:       free,
          length:     50
        }).getData();
    }

    function find(id) {
        // FIXME: or use lazy resource?
        return root.follow('image', {id: id}).getResponse();
    }

    function getSession() {
        return session || (session = root.follow('session').getData());
    }

    return {
        root,
        search,
        find,
        getSession
    };
}]);
