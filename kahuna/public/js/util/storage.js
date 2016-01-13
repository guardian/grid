import angular from 'angular';

export const storage  = angular.module('util.storage', []);

storage.factory('storage', ['$window', function($window) {
    function setItem(key, val) {
        const storeVal = typeof val === 'string' ? val : JSON.stringify(val);
        $window.localStorage.setItem(key, storeVal);
    }

    function getItem(key) {
        let val = $window.localStorage.getItem(key);
        try {
            val = JSON.parse(val);
        } catch (_) {}

        return val;
    }

    return {
        setItem,
        getItem
    };
}]);
