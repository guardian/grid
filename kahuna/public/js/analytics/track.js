import angular from 'angular';

import '../mixpanel/mixpanel';

export var track = angular.module('analytics.track', ['mixpanel']);

// TODO: look into tidying the async flow. There might be a small chance of
// `track` being called before the session is got.

track.constant('trackingEnabled', ['mixpanelToken', function(mixpanelToken) {
    return angular.isString(mixpanelToken);
}]);

track.factory('trackingService', ['trackingEnabled', function(trackingEnabled) {
    return {
        enabled: trackingEnabled,
        initialised: false,
        queue: [],
        runQueue: function() {
            this.queue.forEach(fn => fn());
            this.queue = [];
        }
    };
}]);

// convenience function to be used around the site allowing us to track before
// we've initialised mixpanel
track.factory('track', ['trackEvent', 'trackingService', function(trackEvent, trackingService) {

    return trackingService.enabled ? function track(event, opts) {
        if (trackingService.initialised) {
            trackEvent(event, opts);
        } else {
            trackingService.queue.push(() => trackEvent(event, opts));
        }
    } : angular.noop;

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
    }

}]);

track.run(['$rootScope', '$window', 'mixpanel', 'mixpanelToken', 'track', 'trackingService',
           function($rootScope, $window, mixpanel, mixpanelToken, track, trackingService) {

    if (trackingService.enabled) {
        // Only init and track once session loaded
        track('Page viewed')
        $rootScope.$on('events:user-loaded', (_, user) => {
            let {firstName, lastName, email} = user;
            mixpanel.init(mixpanelToken, email, { firstName, lastName, email });

            trackingService.initialised = true;
            trackingService.runQueue();

            track('Page viewed');
        });
    }
}]);
