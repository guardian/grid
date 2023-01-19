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

    function trigger(key, optMsg) {
        errors[key] = optMsg || true;
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
    ['$location', 'globalErrors', '$scope',
        function ($location, globalErrors, $scope) {

            var ctrl = this;
            ctrl.errors = globalErrors.getErrors();

            ctrl.invalidSessionHelpLink = window._clientConfig.invalidSessionHelpLink;
            ctrl.supportEmailLink = window._clientConfig.supportEmail;
            ctrl.systemName = window._clientConfig.systemName;

            // handy as these can happen anywhere
            ctrl.getCurrentLocation = () => $location.url();

            ctrl.dismiss = (error) => globalErrors.destroy(error);

            ctrl.setFocus = () => {
                const autoHideErrorDivs = document.getElementsByClassName('autoHide');
                if (autoHideErrorDivs.length > 0) {
                    for (let errorDiv of autoHideErrorDivs) {
                        errorDiv.focus();
                        errorDiv.addEventListener("keydown", (event) => {
                            if (event.key == "Escape") {
                                ctrl.dismiss(errorDiv.id);
                                ctrl.errors = globalErrors.getErrors();
                            }
                        });
                    }
                }
            };

            $scope.$watchCollection(() => ctrl.errors, () => {
                setTimeout(() => {
                    ctrl.setFocus();
                }, 1);
            });
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
