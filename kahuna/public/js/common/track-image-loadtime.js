import angular from 'angular';
import '../analytics/track';

export var trackImageLoadtime = angular.module('kahuna.common.trackImageLoadtime', [
    'analytics.track'
]);

trackImageLoadtime.controller('TrackImageLoadtimeCtrl',
                              ['$rootScope', '$window', 'track',
                               function($rootScope, $window, track) {
    var ctrl = this;

    var id = ctrl.image.data.id;
    var { mimeType, dimensions: { width, height }, size } = ctrl.image.data.source;
    var trackProps = { id, mimeType, width, height, size, type: ctrl.type };
    var propsWithState = state =>
            angular.extend({ 'Load state': state }, trackProps);

    // FIXME: not sure what best practise of retrieving Date is?
    var timeFrom = time => $window.Date.now() - time;
    var startTime = $window.Date.now();
    var addTimerTo = (props, timer) =>
            angular.extend({ 'Time to': timer || timeFrom(startTime) }, props);

    ctrl.trackSuccess = trackSuccess;
    ctrl.trackError = trackError;

    // TODO: Remove this once `track` can deal with this
    $rootScope.$on('events:track-loaded', trackStart);

    function trackStart() {
        // We use 0 here as it might not be as we rely on the `track-loaded` event
        // This would be inaccurate and just make the stats odd.
        track('Image Loading', addTimerTo(propsWithState('start'), 0));
    }

    function trackSuccess() {
        track('Image Loading', addTimerTo(propsWithState('success')));
    }

    function trackError() {
        track('Image Loading', addTimerTo(propsWithState('error')));
    }

}]);

trackImageLoadtime.directive('gridTrackImageLoadtime', [function() {
    return {
        restrict: 'A',
        controller: 'TrackImageLoadtimeCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            image: '=gridTrackImage',
            type: '@gridTrackImageType'
        },
        link: (_, element, __, ctrl) => {
            element.on('load', ctrl.trackSuccess);
            element.on('error', ctrl.trackError);
        }
    };
}]);
