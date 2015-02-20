import angular from 'angular';

import '../mixpanel/mixpanel';

export var track = angular.module('analytics.track', ['mixpanel']);

// TODO: look into tidying the async flow. There might be a small chance of
// `track` being called before the session is got.

track.factory('trackingEnabled', ['mixpanelToken', function(mixpanelToken) {
    return angular.isString(mixpanelToken);
}]);

track.factory('track', ['$location', '$window', '$document', 'mixpanel', 'trackingEnabled',
                        function($location, $window, $document, mixpanel, trackingEnabled) {

    function capitiliseKeys(obj = {}) {
        // Force this as it's nicer to read in mixpanel and follows their convention
        var capObj= {};
        Object.keys(obj).forEach(k => {
            capObj[k.charAt(0).toUpperCase() + k.slice(1)] = obj[k];
        });
        return capObj;
    }

    return function track(event, opts) {
        var doc = $document[0];
        var { width: winX, height: winY } = $window.screen;
        var { clientWidth: docX, clientHeight: docY } = doc.documentElement;
        var finalOpts = angular.extend({}, capitiliseKeys(opts), {
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

track.run(['$rootScope', '$window', 'mixpanel', 'mixpanelToken', 'track', 'trackingEnabled',
           function($rootScope, $window, mixpanel, mixpanelToken, track, trackingEnabled) {

    if (trackingEnabled) {
        // Only init and track once session loaded
        $rootScope.$on('events:user-loaded', (_, user) => {
            let {firstName, lastName, email} = user;
            mixpanel.init(mixpanelToken, email, { firstName, lastName, email });

            // FIXME: Not sure this is the best way as then everything using track
            // would need to fire on this event. Perhaps track can store events
            // before this and fire them off after.
            $rootScope.$emit('events:track-loaded');

            track('Page viewed');
        });
    }
}]);
