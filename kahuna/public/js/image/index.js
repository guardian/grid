import angular from 'angular';

import './controller';
import '../search/query-filter';

import imageTemplate from './view.html!text';


export var image = angular.module('kahuna.image', [
    'kahuna.image.controller',
    'kahuna.search.filters.query'
]);


image.config(['$stateProvider',
              function($stateProvider) {

    $stateProvider.state('image', {
        url: '/images/:imageId?crop',
        template: imageTemplate,
        controller: 'ImageCtrl'
    });
}]);
