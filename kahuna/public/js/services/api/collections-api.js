import apiServices from '../api';

apiServices.factory('collections', ['mediaApi', function (mediaApi) {
    var collections;

    function getCollections() {
        if(! collections) {
            collections = mediaApi.root.follow('collections').getData();
        }
        return collections;
    }

    return {
        getCollections
    };
}]);
