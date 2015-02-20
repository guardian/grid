import angular from 'angular';
import '../analytics/track';

export var trackImageLoadtime = angular.module('kahuna.common.trackImageLoadtime', [
    'analytics.track'
]);

trackImageLoadtime.controller('TrackImageLoadtimeCtrl',
                              ['$window', 'track',
                               function($window, track) {
    var ctrl = this;

    var id = ctrl.image.data.id;
    var { mimeType, dimensions: { width, height }, size } = ctrl.image.data.source;
    var trackProps = { id, mimeType, width, height, size };

    // FIXME: not sure what best practise of retrieving Date is?
    var timeFrom = time => $window.Date.now() - time;
    var startTime = $window.Date.now();

    ctrl.trackLoaded = trackLoaded;
    ctrl.trackError = trackError;

    function trackStartLoading() {
        timeFrom(startTime)
    }

    function trackLoaded() {

    }

    function trackError() {

    }


}]);

trackImageLoadtime.directive('gridTrackImageLoadtime', [function() {
    return {
        restrict: 'A',
        controller: 'TrackImageLoadtimeCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            image: '=gridTrackImage'
        },
        link: (_, element, __, ctrl) => {
            element.on('load', ctrl.trackLoaded);
            element.on('error', ctrl.trackError);
        }
    }
}]);
