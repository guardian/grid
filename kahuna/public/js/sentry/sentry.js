import angular from 'angular';
import raven from 'raven-js';

export var sentry = angular.module('sentry', []);

// TODO: Add user information
// TODO: Catch angular errors nicely

sentry.factory('sentryEnabled', ['sentryDsn', function(sentryDsn) {
    return angular.isString(sentryDsn);
}]);

sentry.factory('sentryErrorInterceptor', ['$q', function ($q) {
    return {
        responseError: function responseError(rejection) {
            raven.captureException(new Error('HTTP response error'), {
                extra: {
                    config: rejection.status,
                    status: rejection.statusText,
                    data: rejection.data
                }
            });
            return $q.reject(rejection);
        }
    };
}]);

sentry.config(['$httpProvider', function($httpProvider) {
    $httpProvider.interceptors.push('sentryErrorInterceptor');
}]);

sentry.run(['sentryEnabled', 'sentryDsn', function(sentryEnabled, sentryDsn) {
    if (sentryEnabled) {
        raven.config(sentryDsn, {}).install();
    }
}]);
