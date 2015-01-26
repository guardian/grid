import angular from 'angular';

import './controller';
import './preview';

import imageTemplate from './view.html!text';


export var image = angular.module('kahuna.image', [
    'kahuna.image.controller',
    'kahuna.image.preview'
]);


image.config(['$stateProvider',
              function($stateProvider) {

    $stateProvider.state('image', {
        url: '/images/:imageId?crop',
        template: imageTemplate,
        controller: 'ImageCtrl'
    });
}]);
