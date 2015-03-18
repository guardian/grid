import angular from 'angular';
import '../analytics/track';

export var trackImageLoadtime = angular.module('kahuna.common.trackImageLoadtime', [
    'analytics.track'
]);

trackImageLoadtime.controller('TrackImageLoadtimeCtrl',
                              ['$rootScope', 'track',
                               function($rootScope, track) {
    var ctrl = this;
    var trackEventName = 'Image loading';
    var startTime;
    var imageProps;

    ctrl.trackStart = () => track(trackEventName, getTrackProps('start'));
    ctrl.trackSuccess = () => track(trackEventName, getTrackProps('success'));
    ctrl.trackError = () => track(trackEventName, getTrackProps('error'));
    ctrl.init = init;

    function init(image, location) {
        var id = image.data.id;
        var { mimeType, dimensions: { width, height }, size } = image.data.source;

        imageProps = {
            'Image ID':       id,
            'Image width':    width,
            'Image height':   height,
            'Image location': location,
            'Mime type':      mimeType,
            'File size':      size
        };
        startTime = Date.now();
    }

    function timeFrom(time) {
        return Date.now() - time;
    }

    function getTrackProps(state) {
        return angular.extend({
            'Load state': state,
            'Duration': timeFrom(startTime)
        }, imageProps);
    }
}]);

trackImageLoadtime.directive('gridTrackImageLoadtime', [function() {
    return {
        restrict: 'A',
        controller: 'TrackImageLoadtimeCtrl',
        link: (scope, element, attrs, ctrl) => {
            var image = scope.$eval(attrs.gridTrackImage);
            var location = attrs.gridTrackImageLocation;

            ctrl.init(image, location);
            ctrl.trackStart();

            element.on('load', ctrl.trackSuccess);
            element.on('error', ctrl.trackError);
        }
    };
}]);
