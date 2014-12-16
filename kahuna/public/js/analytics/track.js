import angular from 'angular';
import 'mixpanel/mixpanel';

export var track = angular.module('analytics.track', ['mixpanel']);

// TODO: look into tidying the async flow. There might be a small chance of
// `track` being called before the session is got.

track.factory('track', ['$location', '$window', '$document', 'mixpanel',
                        function($location, $window, $document, mixpanel) {
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

        mixpanel.track(event, finalOpts);
    }
}]);

track.run(['mixpanel', 'mixpanelToken', 'track', 'mediaApi',
           function(mixpanel, mixpanelToken, track, mediaApi) {

    mediaApi.getSession().then(({ user: {
        firstName,
        lastName,
        email
    }}) => {
        mixpanel.init(mixpanelToken, email, { firstName, lastName, email });
        track('Page viewed');
    });
}]);
