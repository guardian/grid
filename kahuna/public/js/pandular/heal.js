import angular from 'angular';

import './session';

export var heal = angular.module('pandular.heal', ['pandular.session']);

heal.config(['$provide', function ($provide) {

    $provide.decorator('$http', ['$delegate', '$log', 'pandular.reEstablishSession', 'httpPromise',
                                 function ($http, $log, reEstablishSession, httpPromise) {

        function withRetry(func) {
            return func().catch(error => {
                // Check whether session has expired
                if (error && error.status === 419) {
                    $log.info('Invalid session, attempting to re-establish');

                  // Attempt to re-establish the session once before
                  return reEstablishSession().then(data => {
                        $log.info('Session re-established');

                        // Try again now we have a fresh session
                        return func();
                    }, sessionError => {
                        $log.error('Could not re-establish session: ' + sessionError);

                        // Note: we forward the *original* error we
                        // got from the server
                        throw error;
                    });

                } else {
                    // Error other than expired session, just forward
                    throw error;
                }
            });

        }

        function httpWithRetry(func) {
          return httpPromise.wrap(withRetry(func));
        }


        // Wrap $http
        var wrapper = function(...args) {
            return httpWithRetry(() => $http(...args));
        };

        // Wrap convenience methods (e.g. $http.get(), etc)
        Object.keys($http).filter(function (key) {
            return (typeof $http[key] === 'function');
        }).forEach(function (key) {
            wrapper[key] = function(...args) {
                return httpWithRetry(() => $http[key](...args));
            };
        });

        return wrapper;
    }]);
}]);


/**
 * Helper to wrap plain $q promises into the "special" kind of
 * promises that $http return, with convenience `success` and `error`
 * handlers.
 */
heal.factory('httpPromise', ['$q', function($q) {

    // Both `success` and `error` spread the response properties when
    // invoking their callback
    function spreadResponse(callback) {
        return function({data, status, headers, config, statusText}) {
            callback(data, status, headers, config, statusText);
        };
    }

    // Note: success and error return the original "enriched" promise,
    // they do *not* map the result like `then` does.
    function wrap(requestPromise) {
        var promise = $q.when(requestPromise);
        promise.success = (callback) => {
            promise.then(spreadResponse(callback));
            return promise;
        };
        promise.error = (callback) => {
            promise.catch(spreadResponse(callback));
            return promise;
        };
        return promise;
    }

    return {
        wrap
    };
}]);
