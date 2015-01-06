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
