import angular from 'angular';
import template from './user-actions.html';
import '../components/gr-feature-switch-panel/gr-feature-switch-panel';

export var userActions = angular.module('kahuna.common.userActions', ['gr.featureSwitchPanel']);

userActions.controller('userActionCtrl',
    [
        function() {
            var ctrl = this;

            ctrl.$onInit = () => {
              ctrl.feedbackFormLink = window._clientConfig.feedbackFormLink;
              ctrl.logoutUri = document.querySelector('link[rel="auth-uri"]').href + "logout";
              ctrl.additionalLinks = window._clientConfig.additionalNavigationLinks;
              ctrl.editPotentiallyGraphicScript = () => {
                const decodedCookie = decodeURIComponent(document.cookie);
                const cookieParts = decodedCookie.split(';');
                const maybeExisting = atob(
                  cookieParts.find(_ => _.trim().startsWith('IS_POTENTIALLY_GRAPHIC_SCRIPT='))?.split('=')[1] || ""
                );
                const newCookiePlain = window.prompt(
                  "Enter the 'painless' script for identifying ",
                  maybeExisting
                );
                const newCookieEncoded = btoa(newCookiePlain);
                document.cookie = `IS_POTENTIALLY_GRAPHIC_SCRIPT=${newCookieEncoded};domain=.${window.location.host};path=/;max-age=31536000`;
                window.location.reload();
              };
            };
        }]);

userActions.directive('uiUserActions', [function() {
    return {
        restrict: 'E',
        controller: 'userActionCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template,
        scope: {} // ensure isolated scope
    };
}]);
