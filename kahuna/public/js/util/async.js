import angular from 'angular';

export var async = angular.module('util.async', []);

/**
 * Return a lazy function that will yield before calling the input `func`.
 */
async.factory('nextTick',
              ['$timeout',
               function($timeout) {

    function nextTick(func) {
        return () => $timeout(func, 0);
    }

    return nextTick;
}]);
