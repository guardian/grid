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
