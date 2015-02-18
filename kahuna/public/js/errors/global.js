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


global.controller('GlobalErrorsCtrl', ['globalErrors',
                                       function(globalErrors) {
    var ctrl = this;
    ctrl.errors = globalErrors.getErrors();
}]);


global.directive('uiGlobalErrors', [function() {
    return {
        restrict: 'E',
        controller: 'GlobalErrorsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
