import angular from 'angular';
import './snippet';

export var mp = angular.module('mixpanel', []);

/**
 * This module is to allow the rest of the app to include mixpanel as a dependency
 * and not have to deal with the global `var`.
 */
mp.factory('mixpanel', function() {

    function init(mixpanelToken, id, { firstName, lastName, email }, registerProps = {}) {
        mixpanel.init(mixpanelToken);
        mixpanel.identify(id);
        // setting the object with the `$` vars sets them as predefined
        // variables in mixpanel
        mixpanel.people.set({
            '$first_name': firstName,
            '$last_name': lastName,
            '$email': email
        });
        mixpanel.register(registerProps);
    }

    function track(event, opts) {
        mixpanel.track(event, opts);
    }

    return {
        init: init,
        track: track
    };
});
