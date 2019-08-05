import angular from 'angular';
import template from './global.html';

import 'angular-messages';
import 'pandular';
import '../sentry/sentry';
import './http';

export var globalErrors = angular.module(
    'kahuna.errors.global',
    ['ngMessages', 'pandular.session', 'kahuna.errors.http']
);

globalErrors.factory('globalErrors', [function() {
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
    };
}]);


globalErrors.controller('GlobalErrorsCtrl',
                  ['$location', 'globalErrors',
                   function($location, globalErrors) {

    var ctrl = this;
    ctrl.errors = globalErrors.getErrors();

    ctrl.invalidSessionHelpLink = window._clientConfig.invalidSessionHelpLink;
    ctrl.supportEmailLink = window._clientConfig.supportEmail;

    // handy as these can happen anywhere
    ctrl.getCurrentLocation = () => $location.url();

    ctrl.dismiss = (error) => globalErrors.destroy(error);
}]);


globalErrors.directive('uiGlobalErrors', [function() {
    return {
        restrict: 'E',
        controller: 'GlobalErrorsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
