import angular from 'angular';
import 'mp/mixpanel';

export var track = angular.module('analytics.track', ['mixpanel']);


// TODO: look into tidying the async flow. There might be a small chance of
// `track` being called before the session is got.

track.factory('track', ['$location', '$window', 'mixpanel', function($location, $window, mixpanel) {
    return function track(event, opts) {
        angular.extend({}, opts, {
            'url': $location.url(),
            'Screen resolution': window.screen.width + ' x ' + window.screen.height,
            'Screen viewport': document.documentElement.clientWidth + ' x ' + document.documentElement.clientHeight
        });

        mixpanel.track(event, opts);
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
        track('viewed');
    });
}]);
