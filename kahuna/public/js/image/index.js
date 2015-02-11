import angular from 'angular';

import './controller';

import imageTemplate from './view.html!text';


export var image = angular.module('kahuna.image', [
    'kahuna.image.controller'
]);


image.config(['$stateProvider',
              function($stateProvider) {

    $stateProvider.state('image', {
        url: '/images/:imageId?crop',
        template: imageTemplate,
        controller: 'ImageCtrl'
    });
}]);

// TODO: move to another file?
image.filter('queryFilter', function() {
    var containsSpace = s => / /.test(s);
    var stripQuotes = s => s.replace(/["']/g, '');

    return (value, field) => {
        let cleanValue = stripQuotes(value);
        if (containsSpace(cleanValue)) {
            return `${field}:"${cleanValue}"`;
        } else {
            return `${field}:${cleanValue}`;
        }
    };
});
