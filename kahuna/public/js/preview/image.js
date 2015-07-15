import angular from 'angular';
import moment from 'moment';

import '../analytics/track';

import template from './image.html!text';

export var image = angular.module('kahuna.preview.image', [
    'analytics.track'
]);

image.controller('uiPreviewImageCtrl', [function () {
    var ctrl = this;

    ctrl.displayAsRelative = dateTime =>
        moment().diff(moment(dateTime), 'days') < 7;

    ctrl.relativeFormat = uploadTime => moment(uploadTime).fromNow();
}]);

image.directive('uiPreviewImage', function() {
    return {
        restrict: 'E',
        scope: {
            image: '=',
            hideInfo: '=',
            selectionMode: '='
        },
        // extra actions can be transcluded in
        transclude: true,
        template: template,
        controller: 'uiPreviewImageCtrl',
        controllerAs: 'ctrl'
    };
});

image.filter('hasExportsOfType', function() {
    return (image, type) => {
        return image.data.exports &&
               image.data.exports.some(ex => ex.type === type);
    };
});
