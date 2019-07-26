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
                  ['$location', 'globalErrors', 'mediaApi',
                   function($location, globalErrors, mediaApi) {

    var ctrl = this;
    ctrl.errors = globalErrors.getErrors();

    mediaApi.getHelpLinks().then(links => {
      ctrl.setInvalidSessionHelpLink(links);
      ctrl.setSupportEmail(links);
    });

    ctrl.setInvalidSessionHelpLink = ({invalidSessionHelp}) => ctrl.invalidSessionHelp = invalidSessionHelp;
    ctrl.setSupportEmail = ({supportEmail}) => ctrl.supportEmail = supportEmail;

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
