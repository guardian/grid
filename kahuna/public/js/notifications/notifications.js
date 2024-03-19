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
  ['$location',
    function ($location) {
      const ctrl = this;

      ctrl.$onInit = () => {
        ctrl.getCurrentLocation = () => $location.url();
        ctrl.notifications = window._clientConfig.announcements;
        ctrl.hasNotifications = ctrl.notifications.length > 0;
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
