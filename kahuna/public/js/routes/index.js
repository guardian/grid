import angular from 'angular';

import './search';
import './image';

export const routes = angular.module('gr.routes', [
    'gr.routes.search',
    'gr.routes.image'
]);

routes.config(['$urlRouterProvider', '$locationProvider',
               function($urlRouterProvider, $locationProvider) {

    // Use real URLs (with History API) instead of hashbangs
    $locationProvider.html5Mode({enabled: true, requireBase: false});
    $urlRouterProvider.otherwise('/');
}]);
