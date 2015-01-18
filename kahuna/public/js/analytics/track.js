import angular from 'angular';
import UAParser from 'ua-parser-js';

import '../mixpanel/mixpanel';

export var track = angular.module('analytics.track', ['mixpanel']);

// TODO: look into tidying the async flow. There might be a small chance of
// `track` being called before the session is got.

track.factory('trackingEnabled', ['mixpanelToken', function(mixpanelToken) {
    return angular.isString(mixpanelToken);
}]);

track.factory('track', ['$location', '$window', '$document', 'mixpanel', 'trackingEnabled',
                        function($location, $window, $document, mixpanel, trackingEnabled) {
    return function track(event, opts) {
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

        if (trackingEnabled) {
            mixpanel.track(event, finalOpts);
        }
    };
}]);

track.run(['$window', 'mixpanel', 'mixpanelToken', 'track', 'mediaApi', 'trackingEnabled',
           function($window, mixpanel, mixpanelToken, track, mediaApi, trackingEnabled) {

    // Pass in UA string as else UAParser doesn't detect it correctly (SystemJS?)
    var ua      = new UAParser($window.navigator.userAgent);
    var browser = ua.getBrowser();
    // var os      = ua.getOS();

    // Set the browser and OS version for every tracked event
    var props = {
        // Note: Browser and Operating System already tracked by Mixpanel
        'Browser Version': browser.major,
        // Disabling 'os.version' as it seems to be buggy (returns 'Chromium' !?)
        // 'Operating System Version': os.version
    };

    mediaApi.getSession().then(({ user: {
        firstName,
        lastName,
        email
    }}) => {
        if (trackingEnabled) {
            mixpanel.init(mixpanelToken, email, { firstName, lastName, email }, props);
            track('Page viewed');
        }
    });
}]);
