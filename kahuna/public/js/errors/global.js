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
    ['$location', 'globalErrors','$scope',
        function ($location, globalErrors, $scope) {

            var ctrl = this;
            ctrl.errors = globalErrors.getErrors();

            ctrl.invalidSessionHelpLink = window._clientConfig.invalidSessionHelpLink;
            ctrl.supportEmailLink = window._clientConfig.supportEmail;
            ctrl.systemName = window._clientConfig.systemName;

            // handy as these can happen anywhere
            ctrl.getCurrentLocation = () => $location.url();

            ctrl.dismiss = (error) => globalErrors.destroy(error);

            document.addEventListener("mouseup", () => {
                const autoHideErrorDivs = document.getElementsByClassName('autoHide');
                if (autoHideErrorDivs.length > 0) {
                    for (let errorDiv of autoHideErrorDivs) {
                        if (!errorDiv.contains(document.activeElement)) {
                            ctrl.dismiss(errorDiv.id);
                        }
                    }
                    $scope.$digest();
                }
            });

            document.addEventListener("scroll", () => {
                const autoHideErrorDivs = document.getElementsByClassName('autoHide');
                if (autoHideErrorDivs.length > 0) {
                    for (let errorDiv of autoHideErrorDivs) {
                        ctrl.dismiss(errorDiv.id);
                    }
                    $scope.$digest();
                }
            });

            document.addEventListener("keydown", (event) =>{
                const autoHideErrorDivs = document.getElementsByClassName('autoHide');
                if (autoHideErrorDivs.length > 0) {
                    if (event.key == "Escape") {
                        for (let errorDiv of autoHideErrorDivs) {
                            ctrl.dismiss(errorDiv.id);
                        }
                        $scope.$digest();
                    }
                }
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
