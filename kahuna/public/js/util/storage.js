import angular from 'angular';

export const storage  = angular.module('util.storage', []);

storage.factory('storage', ['$window', function($window) {
    function setJs(key, val) {
        $window.localStorage.setItem(key, JSON.stringify(val));
    }

    function getJs(key) {
        let val = $window.localStorage.getItem(key);
        try {
            val = JSON.parse(val);
        } catch (_) {
            throw new Error(`Could not parse JSON: ${val} for: ${key}`);
        }

        return val;
    }

    return {
        setJs,
        getJs
    };
}]);
