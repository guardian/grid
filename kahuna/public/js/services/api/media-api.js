import apiServices from 'services/api';

apiServices.factory('mediaApi',
                    ['mediaApiUri', 'theseus.Client',
                     function(mediaApiUri, client) {

    var root = client.resource(mediaApiUri);

    // FIXME: oops, need $q promises all the way in theseus

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
        // FIXME: expose a public method to get the response? or use lazy resource?
        return root.follow('image', {id: id}).getResponse();
        // return root.follow('image', {id: id});
    }

    return {
        root: root,
        search: search,
        find: find
    };
}]);
