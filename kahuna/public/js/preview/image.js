import angular from 'angular';

import template from './image.html!text';
import '../assets/location';

export var image = angular.module('kahuna.preview.image', [
    'kahuna.assets.location'
]);

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
        template: template
    };
});

image.filter('hasExportsOfType', function() {
    return (image, type) => {
        return image.data.exports &&
               image.data.exports.some(ex => ex.type === type);
    };
});
