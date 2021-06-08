import angular from 'angular';
import * as Sentry from '@sentry/browser';
import { CaptureConsole } from '@sentry/integrations';


export var sentry = angular.module('sentry', []);

// Standard AngularJS HTTP request with $http
const httpErrorProps = ['config', 'data', 'headers', 'status', 'statusText'];
// HTTP request made with [AnyHttp](https://github.com/argo-rest/any-http-angular), used by Theseus (see theseus-angular.js)
const anyHttpErrorProps = ['uri', 'body', 'status', 'headers'];

const unhandledRejectionMessage = "Possibly unhandled rejection: ";

/**
 * Parses the JSON contained in an unhandled promise rejection, if it exists.
 * Otherwise, returns undefined.
 *
 * @param {string} errorMsg
 * @return {obj|undefined}
 */
function parseUnhandledRejectionMessage(errorMsg) {
  if (typeof errorMsg !== "string") {
    return;
  }
  const messageIndex = errorMsg.indexOf(unhandledRejectionMessage);
  if (messageIndex === -1) {
    return;
  }
  const maybeMessageJson = errorMsg.substr(messageIndex + unhandledRejectionMessage.length);
  try {
    return JSON.parse(maybeMessageJson);
  } catch (e) {
    return;
  }
}


/**
 * Does this object represent a failed HTTP request?
 *
 * @param {object} obj
 * @returns {boolean}
 */
function isHttpError(obj) {
  const objKeys = Object.keys({
    ...obj,
    ...(parseUnhandledRejectionMessage(obj) || {})
  });

  return httpErrorProps.every(key => objKeys.indexOf(key) !== -1) ||
    anyHttpErrorProps.every(key => objKeys.indexOf(key) !== -1);
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
            if (!isHttpError(exception)) {
                Sentry.captureException(exception, cause);
            }
        };
    }]);
}]);

sentry.run(['$rootScope', 'sentryEnabled', 'sentryDsn',
            ($rootScope, sentryEnabled, sentryDsn) => {
    if (sentryEnabled) {
      Sentry.init({dsn: sentryDsn,
        integrations: [
          new CaptureConsole({})
        ]});
      // Ensures user data is blank
      Sentry.setContext('session_id', window._clientConfig.sessionId);
    }
}]);
