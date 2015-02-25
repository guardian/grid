import angular from 'angular';

import '../mixpanel/mixpanel';

export var track = angular.module('analytics.track', ['mixpanel']);

track.factory('trackingService', ['trackEvent', function(trackEvent) {
    var queue = [];
    var initialised = false;

    // queue up results before we've started
    var track = (event, opts) => {
        if (initialised) {
            trackEvent(event, opts);
        } else {
            queue.push(() => trackEvent(event, opts));
        }
    };

    return {
        start: function() {
            queue.forEach(fn => fn());
            queue = [];
            initialised = true;
        },
        track: track
    };

}]);

// convenience function
track.factory('track', ['trackingService', function(trackingService) {

    return trackingService.track;

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
