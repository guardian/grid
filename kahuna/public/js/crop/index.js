import angular from 'angular';

import './controller';

import cropTemplate from './view.html!text';


export var crop = angular.module('kahuna.crop', [
    'kahuna.crop.controller'
]);


crop.config(['$stateProvider',
             function($stateProvider) {

    $stateProvider.state('crop', {
        url: '/images/:imageId/crop',
        template: cropTemplate,
        controller: 'ImageCropCtrl as imageCropCtrl'
    });
}]);
