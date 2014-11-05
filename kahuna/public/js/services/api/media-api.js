import apiServices from 'services/api';

apiServices.factory('mediaApi',
                    ['mediaApiUri', 'theseus.Client',
                     function(mediaApiUri, client) {

    var root = client.resource(mediaApiUri);

    function search(query = '', {since, until, archived, uploadedBy}) {
        return root.follow('search', {
          q:        query,
          since:    since,
          until:    until,
          uploadedBy: uploadedBy,
          archived: archived,
          length:   50
        }).getData();
    }

    function find(id) {
        // FIXME: or use lazy resource?
        return root.follow('image', {id: id}).getResponse();
    }

    function session() {
        return root.follow('session').getData();
    }

    return {
        root: root,
        search: search,
        find: find,
        session: session
    };
}]);
