import angular from 'angular';

import '../mixpanel/mixpanel';

export var track = angular.module('analytics.track', ['mixpanel']);

track.factory('trackingService', ['trackEvent', function(trackEvent) {
    var queue = [];
    var initialised = false;
    const tracker = { start, event, success, failure };

    // queue up results before we've started
    function event(eventName, opts = {}) {
        if (initialised) {
            trackEvent(eventName, opts);
        } else {
            queue.push(() => trackEvent(eventName, opts));
        }
    }

    function success(eventName, opts) {
        const finalOpts = angular.extend({}, opts, { 'State': 'success' });
        event(eventName, finalOpts);
    }

    function failure(eventName, opts) {
        const finalOpts = angular.extend({}, opts, { 'State': 'failure' });
        event(eventName, finalOpts);
    }

    function start() {
        queue.forEach(fn => fn());
        queue = [];
        initialised = true;
    }

    function timeSince(from) {
        return Date.now() - from;
    }

    function makeTimedTrack() {
        const started = Date.now();
        const timedTrack = Object.keys(tracker).reduce((prev, def) => {
            prev[def] = function(eventName, opts = {}) {
                const timedOpts = angular.extend({}, opts, { 'Duration': timeSince(started) });
                tracker[def](eventName, timedOpts);
            };
            return prev;
        }, {});

        return timedTrack;
    }



    return angular.extend({}, tracker, { makeTimedTrack });

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
