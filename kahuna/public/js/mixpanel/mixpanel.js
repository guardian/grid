// As an exception, we refer to mixpanel on the window
/* global mixpanel */
import angular from 'angular';
import './snippet';
import UAParser from 'ua-parser-js';

export var mp = angular.module('mixpanel', []);

mp.constant('mixpanelEnabled', ['mixpanelToken', function(mixpanelToken) {
    return angular.isString(mixpanelToken);
}]);

/**
 * This module is to allow the rest of the app to include mixpanel as a dependency
 * and not have to deal with the global `var`.
 */
mp.factory('mixpanel', ['$window', 'mixpanelEnabled', function($window, mixpanelEnabled) {
    var ua      = new UAParser($window.navigator.userAgent);
    var browser = ua.getBrowser();

    function init(mixpanelToken, id, { firstName, lastName, email }, registerProps = {}) {
        mixpanel.init(mixpanelToken);
        mixpanel.identify(id);
        // setting the object with the `$` vars sets them as predefined
        // variables in mixpanel
        mixpanel.people.set({
            '$first_name': firstName,
            '$last_name': lastName,
            '$email': email,
            'Browser version': browser.major
        });

        // also record browser version alongside each event
        mixpanel.register_once(angular.extend({
            'Browser version': browser.major,
            'Email': email
        }, registerProps));
    }

    function track(event, opts) {
        if (mixpanel.track) {
            mixpanel.track(event, opts);
        } else {
            throw new Error('mixpanel.track called but not defined (called before mixpanel.init?)');
        }
    }

    return {
        init: init,
        track: track,
        isEnabled: () => mixpanelEnabled
    };
}]);
