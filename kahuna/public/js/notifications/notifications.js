import angular from 'angular';
import template from './notifications.html';
import '../components/gr-notifications-banner/gr-notifications-banner';

import 'angular-messages';
import 'pandular';
import '../sentry/sentry';

export var notifications = angular.module(
  'kahuna.notifications',
  ['ngMessages', 'pandular.session', 'gr.notificationsBanner']
);

notifications.controller('NotificationsCtrl',
  ['$location', '$scope',
    function ($location, $scope) {

      var ctrl = this;

      ctrl.$onInit = () => {
        ctrl.notifications = window._clientConfig.announcements;
        ctrl.hasNotifications = ctrl.notifications.length > 0;

        // handy as these can happen anywhere
        ctrl.getCurrentLocation = () => $location.url();

        ctrl.dismiss = (notification) => {
          // remove notification
        }

      };
  }
]);

notifications.directive('uiNotifications', [function() {
  return {
    restrict: 'E',
    controller: 'NotificationsCtrl',
    controllerAs: 'ctrl',
    bindToController: true,
    template: template
  };
}]);
