import angular from 'angular';
import template from './user-actions.html';

export var userActions = angular.module('kahuna.common.userActions', []);

userActions.directive('uiUserActions', [function() {
    return {
        restrict: 'E',
        template: template
    };
}]);
