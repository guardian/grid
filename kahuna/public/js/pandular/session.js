import angular from 'angular';

import {reEstablishSession} from '../panda/session';


export var session = angular.module('pandular.session', []);

/**
 * The URI of a page that triggers a re-authentication cycle and ends
 * on a page on the same domain as the current if successful.
 *
 * Can be a relative path to the current page.
 */
session.factory('pandular.reAuthUri', () => { throw new RequiredConfiguration('pandular.reAuthUri'); });

/**
 * The number of milliseconds to wait for the session to re-establish
 * before giving up.
 */
session.constant('pandular.reAuthTimeout', 5000 /* ms */);


session.factory('pandular.reEstablishSession',
                ['pandular.reAuthUri', 'pandular.reAuthTimeout',
                 function(reAuthUri, reAuthTimeout) {

    return () => reEstablishSession(reAuthUri, reAuthTimeout);
}]);


class RequiredConfiguration extends Error {
    constructor(name) {
        // FIXME: for some reason the message doesn't come through?
        super('Missing configuration value: ' + name);
    }
}
