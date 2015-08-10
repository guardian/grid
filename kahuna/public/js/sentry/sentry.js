import angular from 'angular';
import raven from 'raven-js';

export var sentry = angular.module('sentry', []);

const httpErrorProps = ['config', 'data', 'headers', 'status', 'statusText'];
function isHttpError(obj) {
    const objKeys = Object.keys(obj);
    return httpErrorProps.every(key => objKeys.indexOf(key) !== -1);
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

        $rootScope.$on('events:user-loaded', (_, user) => {
            raven.setUserContext({
                // Underscores get converted into spaces by Sentry:
                email: user.email,
                first_name: user.firstName,
                last_name: user.lastName
            });
        });
    }
}]);
