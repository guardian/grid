import angular from 'angular';

import 'theseus-angular';

export var permissionsApi = angular.module('kahuna.services.api.permissions', [
    'theseus'
]);

permissionsApi.factory('permissionsApi',
                 ['permissionsApiUri', 'theseus.client',
                  function(permissionsApiUri, client) {

    var root = client.resource(permissionsApiUri);

    function get() {
        return root.getData();
    }

    return {
        get
    };
}]);
