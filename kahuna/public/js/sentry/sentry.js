import angular from 'angular';
import raven from 'raven-js';

export var sentry = angular.module('sentry', []);

sentry.factory('sentryEnabled', ['sentryDsn', function(sentryDsn) {
    return angular.isString(sentryDsn);
}]);

// TODO: Alternatively could investigate angular-raven
sentry.config(['$provide', function ($provide) {
    $provide.decorator('$exceptionHandler', ['$delegate', function ($delegate) {
        return function (exception, cause) {
            $delegate(exception, cause);
            raven.captureException(exception, cause);
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
