import angular from 'angular';
import raven from 'raven-js';

export var sentry = angular.module('sentry', []);

// TODO: Add user information
// TODO: Catch angular errors nicely

sentry.factory('sentryEnabled', ['sentryDsn', function(sentryDsn) {
    return angular.isString(sentryDsn);
}]);

sentry.factory('sentry', [function() {

    function trigger(errorMessage, extra) {
        raven.captureException(new Error(errorMessage), { extra });
    }

    return { trigger };
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
