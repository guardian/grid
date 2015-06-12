import angular from 'angular';

import '../mixpanel/mixpanel';

export var track = angular.module('analytics.track', ['mixpanel']);

track.factory('trackingService', ['trackEvent', function(trackEvent) {
    var queue = [];
    var initialised = false;
    const timers = new Map();

    // queue up results before we've started
    function event(eventName, opts, config) {
        if (initialised) {
            const finalOpts = config.timed ? addTimer(eventName, opts) : opts;

            trackEvent(eventName, finalOpts);
        } else {
            queue.push(() => trackEvent(eventName, opts, config));
        }
    }

    function success(eventName, opts, config) {
        const finalOpts = angular.extend({}, opts, { state: 'success' });
        event(eventName, finalOpts, config);
    }

    function failure(eventName, opts, config) {
        const finalOpts = angular.extend({}, opts, { state: 'failure' });
        event(eventName, finalOpts, config);
    }

    function start() {
        queue.forEach(fn => fn());
        queue = [];
        initialised = true;
    }

    function startTimerFor(eventName) {
        timers.set(eventName, Date.now());
    }

    function addTimer(eventName, opts) {
        const timer = timers.get(eventName);
        return timer ? angular.extend({}, opts, { took: timeSince(timer) }) : opts;
    }

    function timeSince(from) {
        return Date.now() - from;
    }

    return { start, event, startTimerFor, success, failure };

}]);

// convenience naming
track.factory('track', ['trackingService', function(trackingService) {

    return trackingService;

}]);

track.factory('trackEvent', ['$location', '$window', '$document', 'mixpanel',
                             function($location, $window, $document, mixpanel) {

    return function trackEvent(event, opts) {
        var doc = $document[0];
        var { width: winX, height: winY } = $window.screen;
        var { clientWidth: docX, clientHeight: docY } = doc.documentElement;
        var finalOpts = angular.extend({}, opts, {
            'Url': $location.url(),
            'Screen resolution': winX + ' x ' + winY,
            'Screen resolution X': winX,
            'Screen resolution Y': winY,
            'Screen viewport': docX + ' x ' + docY,
            'Screen viewport X': docX,
            'Screen viewport Y': docY
        });

        if (mixpanel.isEnabled()) {
            mixpanel.track(event, finalOpts);
        }
    };

}]);

track.run(['$rootScope', '$window', 'mixpanelToken', 'mixpanel', 'trackingService',
            function($rootScope, $window, mixpanelToken, mixpanel, trackingService) {

    // Only init and track once session loaded
    $rootScope.$on('events:user-loaded', (_, user) => {
        let {firstName, lastName, email} = user;

        if (mixpanel.isEnabled()) {
            mixpanel.init(mixpanelToken, email, { firstName, lastName, email });
        }

        trackingService.start();
    });

}]);
