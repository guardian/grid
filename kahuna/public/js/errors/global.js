import angular from 'angular';
import template from './global.html!text';

import 'angular-messages';

export var global = angular.module('kahuna.errors.global', ['ngMessages']);

global.controller('GlobalErrorCtrl', [function() {

}]);


global.directive('uiGlobalError', [function() {
    return {
        restrict: 'E',
        controller: 'GlobalErrorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
