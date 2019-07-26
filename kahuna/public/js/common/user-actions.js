import angular from 'angular';
import template from './user-actions.html';

export var userActions = angular.module('kahuna.common.userActions', []);

userActions.controller('userActionCtrl',
  ['mediaApi',
    function(mediaApi) {
      var ctrl = this
      mediaApi.getHelpLinks().then(links => ctrl.setFeedbackForm(links));
      ctrl.setFeedbackForm = ({feedbackForm}) => ctrl.feedbackForm = feedbackForm;
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
