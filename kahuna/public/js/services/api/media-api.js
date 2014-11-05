import apiServices from 'services/api';

apiServices.factory('mediaApi',
                    ['mediaApiUri', 'theseus.Client',
                     function(mediaApiUri, client) {

    var root = client.resource(mediaApiUri);
    var u; // user shorthand so as not to conflict with method

    function search(query = '', {ids, since, until, archived, uploadedBy}) {
        return root.follow('search', {
          q:          query,
          ids:        ids,
          since:      since,
          until:      until,
          uploadedBy: uploadedBy,
          archived:   archived,
          length:     50
        }).getData();
    }

    function find(id) {
        // FIXME: or use lazy resource?
        return root.follow('image', {id: id}).getResponse();
    }

    function session() {
        return root.follow('session').getData();
    }

    function user() {
        return !u ? session().then(resp => u = resp.user) : Promise.resolve(u);
    }

    return {
        root: root,
        search: search,
        find: find,
        session: session,
        user: user
    };
}]);
