import apiServices from 'services/api';

var pandaApi = apiServices.factory('pandaApi',
                    ['pandaUri', 'theseus.Client',
                     function(pandaUri, client) {

    var root = client.resource(pandaUri);

    function me() {
        return root.getData().then(index => index.user);
    }

    return {
        me: me
    };
}]);
