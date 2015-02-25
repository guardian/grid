import angular from 'angular';

import '../mixpanel/mixpanel';

export var track = angular.module('analytics.track', ['mixpanel']);

// TODO: look into tidying the async flow. There might be a small chance of
// `track` being called before the session is got.

track.constant('mixpanelEnabled', ['mixpanelToken', function(mixpanelToken) {
    return angular.isString(mixpanelToken);
}]);

track.factory('trackingService', ['mixpanelEnabled', 'trackEvent', function(mixpanelEnabled, trackEvent) {
    var queue = [];
    var initialised = false;
    var enabled = mixpanelEnabled;

    // queue up results before we've started
    var track = (event, opts) => {
        if (initialised) {
            trackEvent(event, opts);
        } else {
            queue.push(() => trackEvent(event, opts));
        }
    };

    return {
        isEnabled: () => enabled,
        start: function() {
            queue.forEach(fn => fn());
            queue = [];
            initialised = true;
        },
        track: enabled ? track : angular.noop
    };

}]);

// convenience function
track.factory('track', ['trackingService', function(trackingService) {

    return trackingService.track;

}]);

track.factory('trackEvent', ['$location', '$window', '$document', 'mixpanel',
                        function($location, $window, $document, mixpanel) {

    return function trackEvent(event, opts) {
        console.log(event)
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

    if (trackingService.isEnabled()) {
        track('Page viewed');

        // Only init and track once session loaded
        $rootScope.$on('events:user-loaded', (_, user) => {
            let {firstName, lastName, email} = user;
            mixpanel.init(mixpanelToken, email, { firstName, lastName, email });

            trackingService.start();

            track('Page viewed');
        });
    }

}]);
