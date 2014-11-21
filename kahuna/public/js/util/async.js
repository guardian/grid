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


/**
 * Return a Promise that is resolved with no value after `duration`.
 */
async.factory('delay',
              ['$q', '$timeout',
               function($q, $timeout) {

    function delay(duration) {
        var defer = $q.defer();
        $timeout(defer.resolve, duration);
        return defer.promise;
    }

    return delay;
}]);


async.factory('poll',
               ['delay',
                function(delay) {

    function poll(func, pollEvery, maxWait) {
        // FIXME: error?
        var timeout = delay(maxWait).then(() => { throw new Error('timeout!'); });

        function pollRecursive() {
            return func().catch(error => {
                return delay(pollEvery).then(pollRecursive);
            });
        }

        return pollRecursive();
    }

    return poll;
}]);
