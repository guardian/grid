import angular from 'angular';

import 'theseus-angular';

export var permissionsApi = angular.module('kahuna.services.api.permissions', [
    'theseus'
]);

permissionsApi.factory('permissionsApi', ['mediaApi', function(mediaApi) {

    var root;
    var permissions;

    function getRoot() {
        return root || (root = mediaApi.root.follow('permissions'));
    }

    function extractPermissions() {
        return getRoot().getData().then((data) => data.permissionsSet.permissions);
    }

    function getPermissions() {
        return permissions || (permissions = extractPermissions());
    }

    function hasPermission(permission) {
        return getPermissions().then((permissions) => {
             return Boolean(
                permissions.find(
                    (availablePermission) => availablePermission === permission
                )
            );
        });
    }

    return {
        getPermissions,
        hasPermission
    };
}]);
