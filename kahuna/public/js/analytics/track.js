import angular from 'angular';

import '../mixpanel/mixpanel';

export var track = angular.module('analytics.track', ['mixpanel']);

track.factory('trackingService', ['trackEvent', function(trackEvent) {
    var queue = [];
    var initialised = false;
    const timers = new Map();

    // queue up results before we've started
    function event(eventName, opts) {
        if (initialised) {
            trackEvent(eventName, opts);
        } else {
            queue.push(() => trackEvent(eventName, opts));
        }
    }

    function timedEvent(eventName, opts) {
        const timedOpts = addTimer(eventName, opts);

        event(event, timedOpts);
    }

    function startTimerFor(eventName) {
        timers.set(eventName, Date.now());
    }

    function start() {
        queue.forEach(fn => fn());
        queue = [];
        initialised = true;
    }

    function addTimer(eventName, opts) {
        const timer = timers.get(eventName);
        return timer ? angular.extend({}, { took: timeSince(timer) }, opts) : opts;
    }

    function timeSince(from) {
        return Date.now() - from;
    }

    return { start, event, startTimerFor, timedEvent };

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
