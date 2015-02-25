import angular from 'angular';
import '../analytics/track';

export var trackImageLoadtime = angular.module('kahuna.common.trackImageLoadtime', [
    'analytics.track'
]);

trackImageLoadtime.controller('TrackImageLoadtimeCtrl',
                              ['$rootScope', 'track',
                               function($rootScope, track) {
    var ctrl = this;

    var id = ctrl.image.data.id;
    var trackEventName = 'Image loading';

    var { mimeType, dimensions: { width, height }, size } = ctrl.image.data.source;
    var trackProps = {
        'Image ID':  id,
        'Mime type': mimeType,
        'Width':     width,
        'Height':    height,
        'File size': size,
        'Image location':  ctrl.location
    };
    var propsWithState = state =>
            angular.extend({ 'Load state': state }, trackProps);

    // FIXME: not sure what best practise of retrieving Date is?
    var timeFrom = time => Date.now() - time;
    var startTime = Date.now();
    var addTimerTo = props =>
        angular.extend({ 'Duration': timeFrom(startTime) }, props);

    ctrl.trackSuccess = trackSuccess;
    ctrl.trackError = trackError;

    trackStart();

    function trackStart() {
        track(trackEventName, addTimerTo(propsWithState('start')));
    }

    function trackSuccess() {
        track(trackEventName, addTimerTo(propsWithState('success')));
    }

    function trackError() {
        track(trackEventName, addTimerTo(propsWithState('error')));
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
            location: '@gridTrackImageLocation'
        },
        link: (_, element, __, ctrl) => {
            element.on('load', ctrl.trackSuccess);
            element.on('error', ctrl.trackError);
        }
    };
}]);
