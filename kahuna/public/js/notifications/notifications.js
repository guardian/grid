import angular from 'angular';
import template from './notifications.html';
import '../components/gr-notifications-banner/gr-notifications-banner';

export var notifications = angular.module(
  'kahuna.notifications',
  ['gr.notificationsBanner']
);

notifications.controller('NotificationsCtrl',
  ['$window',
    function () {
      const notifctrl = this;
      notifctrl.$onInit = () => {
        notifctrl.notifications = window._clientConfig.announcements;
        notifctrl.hasNotifications = notifctrl.notifications.length > 0;
      };
    }
]);

notifications.directive('uiNotifications', [function() {
  return {
    restrict: 'E',
    controller: 'NotificationsCtrl',
    controllerAs: 'notifctrl',
    bindToController: true,
    template: template
  };
}]);
