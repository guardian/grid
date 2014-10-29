import apiServices from 'services/api';

apiServices.factory('mediaApi',
                    ['mediaApiUri', 'theseus.Client',
                     function(mediaApiUri, client) {

    var root = client.resource(mediaApiUri);

    function search(query = '', {since, until, archived}) {
        return root.follow('search', {
          q:        query,
          since:    since,
          until:    until,
          archived: archived,
          length:   50
        }).getData();
    }

    function find(id) {
        // FIXME: or use lazy resource?
        return root.follow('image', {id: id}).getResponse();
    }

    return {
        root: root,
        search: search,
        find: find
    };
}]);
