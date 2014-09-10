import apiServices from 'services/api';

apiServices.factory('mediaApi',
                    ['$http', 'mediaApiUri',
                     function($http, mediaApiUri) {

    function getRoot() {
        return $http.get(mediaApiUri);
    }

    function search(query, options) {
        options = options || {};

        return $http.get(mediaApiUri + '/images', {
            params: {
                q:      query || '',
                since:  options.since,
                until:  options.until,
                length: 20
            },
            withCredentials: true
        }).then(function(response) {
            return response.data.data;
        });
    }

    function find(id) {
        return $http.get(mediaApiUri + '/images/' + id, { withCredentials: true }).then(function(response) {
            return response.data;
        });
    }

    return {
        getRoot: getRoot,
        search: search,
        find: find
    };
}]);
