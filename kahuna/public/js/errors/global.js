import angular from 'angular';
import template from './global.html!text';

import 'angular-messages';

export var global = angular.module('kahuna.errors.global', ['ngMessages']);

global.factory('globalErrors', function() {
    var errors = {};

    function trigger(key) {
        errors[key] = true;
    }

    function destroy(key) {
        delete errors[key];
    }

    function getErrors() {
        return errors;
    }

    return {
        trigger,
        destroy,
        getErrors
    }
});

global.controller('GlobalErrorCtrl', ['globalErrors', function(globalErrors) {
    var ctrl = this;
    ctrl.errors = globalErrors.getErrors();
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
