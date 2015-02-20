import angular from 'angular';

export var trackImageLoadtime = angular.module('kahuna.common.trackImageLoadtime', []);

trackImageLoadtime.controller('TrackImageLoadtimeCtrl', function() {
    var ctrl = this;

    var id = ctrl.image.data.id;
    var { mimeType, dimensions: { width, height }, size } = ctrl.image.data.source;
    var trackProps = { id, mimeType, width, height, size };

    ctrl.trackLoaded = trackLoaded;

    function trackLoaded() {
        
    }
});

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
        }
    }
}]);
