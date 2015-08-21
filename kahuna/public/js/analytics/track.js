import angular from 'angular';

import '../mixpanel/mixpanel';
import '../util/async';

export var track = angular.module('analytics.track', [
    'mixpanel',
    'util.async'
]);

track.factory('trackingService', ['trackEvent', function(trackEvent) {
    let queue = [];
    let initialised = false;
    let runTracking = false;
    const tracker = { action, success, failure };

    // queue up results before we've started
    function action(eventName, opts = {}) {
        if (initialised) {
            triggerEvent(eventName, opts);
        } else {
            queue.push(() => triggerEvent(eventName, opts));
        }
    }

    function triggerEvent(eventName, opts = {}) {
        if (runTracking) {
            trackEvent(eventName, opts);
        }
    }

    function success(eventName, opts = {}) {
        const finalOpts = angular.extend({}, opts, { successful: true });
        action(eventName, finalOpts);
    }

    function failure(eventName, opts = {}) {
        const finalOpts = angular.extend({}, opts, { successful: false });
        action(eventName, finalOpts);
    }

    function start(runTracking_) {
        runTracking = runTracking_;
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

    return angular.extend({}, tracker, { makeTimedTrack, start });

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

        mixpanel.track(event, finalOpts);
    };

}]);

track.run(['$rootScope', '$q', 'onNextEvent', 'mixpanel', 'trackingService',
            function($rootScope, $q, onNextEvent, mixpanel, trackingService) {

    // Only init and track once session and config loaded
    const userPromise = onNextEvent($rootScope, 'events:user-loaded');
    const mixpanelTokenPromise = onNextEvent($rootScope, 'events:config-loaded').
        then(({mixpanelToken}) => mixpanelToken);

    $q.all([userPromise, mixpanelTokenPromise]).
        then(([{firstName, lastName, email}, mixpanelToken]) => {
            let mixpanelConfigured = !! mixpanelToken;
            if (mixpanelConfigured) {
                mixpanel.init(mixpanelToken, email, {firstName, lastName, email});
            }

            trackingService.start(mixpanelConfigured);
        });
}]);

track.directive('grTrackClick', ['track', function(track) {

    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            const name = attrs.grTrackClick;
            const data = scope.$eval(attrs.grTrackClickData);

            element.on('click', () => track.action(name, data));
        }
    };

}]);
