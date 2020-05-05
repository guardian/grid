import angular from 'angular';
import raven from 'raven-js';

export var sentry = angular.module('sentry', []);

// Standard AngularJS HTTP request with $http
const httpErrorProps = ['config', 'data', 'headers', 'status', 'statusText'];
// HTTP request made with [AnyHttp](https://github.com/argo-rest/any-http-angular), used by Theseus (see theseus-angular.js)
const anyHttpErrorProps = ['uri', 'body', 'status', 'headers'];

function isHttpError(obj) {
    const objKeys = Object.keys(obj);
    return httpErrorProps.every(key => objKeys.indexOf(key) !== -1) ||
      anyHttpErrorProps.every(key => objKeys.indexOf(key) !== -1)
}

/**
 * Handle a HTTP error in a .catch block, ensuring that it's not propagated
 * to the Angular $q service's handler code. Errors that reach this point will
 * be logged by Sentry, and we don't want to do this for every HTTP error.
 *
 * @param { Error | { uri: string, status: number, body: any, headers: {[name]: value} }} error
 * @return undefined
 * @throw Error
 */
export function handlePossibleHttpError(error) {
  if (isHttpError(error)) {
    console.warn(error);
    return;
  }
  throw error;
}

sentry.factory('sentryEnabled', ['sentryDsn', function(sentryDsn) {
    return angular.isString(sentryDsn);
}]);

// TODO: Alternatively could investigate angular-raven
sentry.config(['$provide', function ($provide) {
    $provide.decorator('$exceptionHandler', ['$delegate', function ($delegate) {
        return function (exception, cause) {
            $delegate(exception, cause);

            // Don't send failed HTTP requests as that's mostly just
            // noise we already get in other logs
            if (! isHttpError(exception)) {
                raven.captureException(exception, cause);
            }
        };
    }]);
}]);

sentry.run(['$rootScope', 'sentryEnabled', 'sentryDsn',
            ($rootScope, sentryEnabled, sentryDsn) => {
    if (sentryEnabled) {
        raven.config(sentryDsn, {}).install();
        // Ensures user data is blank
        raven.setUserContext({});

        raven.setExtraContext({
          'session_id': window._clientConfig.sessionId
        });
    }
}]);
