import angular from 'angular';
import template from './user-actions.html';
import '../components/gr-feature-switch-panel/gr-feature-switch-panel';
import {graphicImageBlurService} from "../services/graphic-image-blur";

export var userActions = angular.module('kahuna.common.userActions', ['gr.featureSwitchPanel', graphicImageBlurService.name]);

userActions.controller('userActionCtrl',
    [
        '$scope', 'graphicImageBlurService', function($scope, graphicImageBlurService) {
            var ctrl = this;

            ctrl.$onInit = () => {
              ctrl.feedbackFormLink = window._clientConfig.feedbackFormLink;
              ctrl.logoutUri = document.querySelector('link[rel="auth-uri"]').href + "logout";
              ctrl.additionalLinks = window._clientConfig.additionalNavigationLinks;
              ctrl.shouldBlurGraphicImages = graphicImageBlurService.shouldBlurGraphicImages;
              ctrl.toggleShouldBlurGraphicImages = graphicImageBlurService.toggleShouldBlurGraphicImages;
              ctrl.showUserActions = graphicImageBlurService.isYetToAcknowledgeBlurGraphicImages; // expand user actions until blurring is acknowledged
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
