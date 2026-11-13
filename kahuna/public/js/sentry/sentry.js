import angular from 'angular';
import * as Sentry from '@sentry/browser';


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

sentry.factory('sentryConfig', [function() {
    return (window._clientConfig && window._clientConfig.sentry) || { enabled: false };
}]);

/**
 * Builds the integration list from server-supplied config, so tracing and replay are absent
 * entirely unless they have been deliberately switched on.
 *
 * @param {object} config
 * @returns {Array}
 */
function integrationsFor(config) {
    const integrations = [];

    const consoleLevels = config.consoleCaptureLevels || [];
    if (consoleLevels.length > 0) {
        integrations.push(Sentry.captureConsoleIntegration({ levels: consoleLevels }));
    }

    if (config.tracesSampleRate > 0) {
        integrations.push(Sentry.browserTracingIntegration());
    }

    // Grid's DOM contains unpublished imagery and photographer PII, so masking is not optional here.
    if (config.replayOnErrorSampleRate > 0) {
        integrations.push(Sentry.replayIntegration({
            maskAllText: true,
            blockAllMedia: true
        }));
    }

    return integrations;
}

// TODO: Alternatively could investigate angular-raven
sentry.config(['$provide', function ($provide) {
    $provide.decorator('$exceptionHandler', ['$delegate', function ($delegate) {
        return function (exception, cause) {
            $delegate(exception, cause);

            // Don't send failed HTTP requests as that's mostly just
            // noise we already get in other logs
            if (!isHttpError(exception)) {
                Sentry.captureException(exception, cause ? { captureContext: { extra: { cause } } } : undefined);
            }
        };
    }]);
}]);

sentry.run(['sentryConfig', (sentryConfig) => {
    if (!sentryConfig.enabled || !sentryConfig.dsn) {
        return;
    }

    Sentry.init({
        dsn: sentryConfig.dsn,
        environment: sentryConfig.environment,
        release: sentryConfig.release,
        integrations: integrationsFor(sentryConfig),
        tracesSampleRate: sentryConfig.tracesSampleRate,
        tracePropagationTargets: sentryConfig.tracePropagationTargets || [],
        // Error-triggered only: Grid sessions are never continuously recorded.
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: sentryConfig.replayOnErrorSampleRate
    });

    // Identity is resolved server-side, so the browser only receives what the configured user mode permits.
    if (sentryConfig.userId || sentryConfig.userEmail) {
        Sentry.setUser({
            ...(sentryConfig.userId ? { id: sentryConfig.userId } : {}),
            ...(sentryConfig.userEmail ? { email: sentryConfig.userEmail } : {})
        });
    }

    // Identifies the kahuna instance that served the page, not the user's session.
    Sentry.setContext('grid', { instanceId: window._clientConfig.sessionId });
}]);
