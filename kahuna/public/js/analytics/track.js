import angular from 'angular';
import 'mixpanel/mixpanel';

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

track.run(['mixpanel', 'mixpanelToken', 'track', 'mediaApi', 'trackingEnabled',
           function(mixpanel, mixpanelToken, track, mediaApi, trackingEnabled) {

    mediaApi.getSession().then(({ user: {
        firstName,
        lastName,
        email
    }}) => {
        if (trackingEnabled) {
            mixpanel.init(mixpanelToken, email, { firstName, lastName, email });
            track('Page viewed');
        }
    });
}]);
