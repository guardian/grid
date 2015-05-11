import angular from 'angular';
import template from './global.html!text';

import 'angular-messages';
import 'pandular';
import '../sentry/sentry';
import './http';

export var global = angular.module('kahuna.errors.global', ['ngMessages', 'pandular.session', 'kahuna.errors.http']);

global.factory('globalErrors', ['sentry', 'httpErrors', function(sentry, httpErrors) {
    var errors = {};

    function trigger(key) {
        const { errorMessage, errorCode } = httpErrors[key] || httpErrors.unknown;
        sentry.trigger(errorMessage, { errorCode });
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
    };
}]);


global.controller('GlobalErrorsCtrl',
                  ['$location', 'globalErrors',
                   function($location, globalErrors) {

    var ctrl = this;
    ctrl.errors = globalErrors.getErrors();

    // handy as these can happen anywhere
    ctrl.getCurrentLocation = () => $location.url();

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
