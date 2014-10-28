import angular from 'angular';
import apiServices from 'services/api';

apiServices.factory('loaderApi',
                    ['$http', 'mediaApi',
                     function($http, mediaApi) {

    var loaderRoot;

    function getLoaderRoot() {
        if (! loaderRoot) {
            loaderRoot = mediaApi.getRoot().then(function(response) {
                var resource = response.data;
                var loaderLink = resource.links.filter(l => l.rel === 'loader')[0];
                return $http.get(loaderLink.href);
            });
        }
        return loaderRoot;
    }

    function getLinkRoot(link) {
        return getLoaderRoot().then(function(response) {
            return response.data.links.filter(l => l.rel === link)[0];
        });
    }

    function load(data) {
        return getLinkRoot("load").then(function(loadLink) {
            return $http({
                url: loadLink.href,
                method: 'POST',
                headers: { 'Content-Type': 'image/jpeg' },
                transformRequest: [],
                data: data
            }, { withCredentials: true });
        });
    }

    return {
        load: load
    };
}]);
