/**
 * Analytics module which listens for events and tracks them as appropriate
 * within Google analytics.
 */

import angular from 'angular';

const initGA = gaId => {
    // tracking script should be on the page already
    if (gaId) {
        window.ga =
            window.ga ||
            ((...args) => (window.ga.q = window.ga.q || []).push(args));

        const { ga } = window;
        ga("create", gaId, "auto");
        ga("set", "transport", "beacon");
        ga("send", "pageview");

        return ga;
    }
    return () => window.debugGA;
};


const wfAnalyticsServiceMod = angular.module('wfAnalyticsServiceMod', []);

wfAnalyticsServiceMod.service('wfAnalyticsService', [
    '$rootScope',
    function($rootScope) {

        //setup ga
        const ga = initGA(window._clientConfig.googleTrackingId);

        $rootScope.$on('track:event', (event, category, action, label, value, dimensions) => {
            // Screen res and viewport may change, so re-tracking
            const fullDimensions = Object.assign({}, {
              'Screen resolution': window.screen.width + ' x ' + window.screen.height,
              'Screen viewport':`${document.documentElement.clientWidth} x
                ${document.documentElement.clientHeight}`
            }, dimensions);


            ga('send', 'event', category, action, label, value, fullDimensions);
        });
    }
]);

export default wfAnalyticsServiceMod;
