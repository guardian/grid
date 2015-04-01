import angular from 'angular';
import template from './rights.html!text';

export var rights = angular.module('kahuna.rights', []);

rights.controller('RightsCtrl', [function() {
    
}]);


rights.directive('uiRights', [function() {
    return {
        restrict: 'E',
        controller: 'RightsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
