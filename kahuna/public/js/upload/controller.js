import angular from 'angular';
import './controller.css';
import './prompt/prompt';
import './recent/recent-uploads';
import '../services/scroll-position';

var upload = angular.module('kahuna.upload.controller', [
    'kahuna.upload.prompt',
    'kahuna.upload.recent',
    'kahuna.services.scroll-position',
    'util.storage'
]);

upload.controller('UploadCtrl', ['uploadManager', 'mediaApi', 'scrollPosition', '$scope', 'storage',
  function (uploadManager, mediaApi, scrollPosition, $scope, storage) {
    var ctrl = this;

    const isOngoingUploadJobs = () => {
      const flattenUploadsArray = [].concat.apply([], Array.from(uploadManager.getCompletedJobs()));
      const isOngoingUploads = flattenUploadsArray.some(jobItem => jobItem.status !== "uploaded");
      return isOngoingUploads;
    };
    $scope.$on("$locationChangeStart", function(event, _, current) {
      // handle route changes
      if (current.indexOf("/upload") > -1) {
          ctrl.displayWarning(event);
      }
    });

    window.onbeforeunload = function () {
      if (uploadManager.getJobs().size > 0 || isOngoingUploadJobs()) {
        return "";
      }
    };

    ctrl.supportEmailLink = window._clientConfig.supportEmail;
    ctrl.systemName = window._clientConfig.systemName;

    mediaApi.canUserUpload().then(canUpload => {
        ctrl.canUpload = canUpload;
    });

    // TODO: Show multiple jobs?
    ctrl.latestJob = uploadManager.getLatestRunningJob();

    ctrl.displayWarning = (e) => {
      if (uploadManager.getJobs().size > 0 || isOngoingUploadJobs()) {
        if (confirm("You have uploads in progress. Are you sure you want to leave this page?") === false) {
          e.preventDefault();
        }
        return "";
      }
    };

    ctrl.onLogoClick = () => {
      mediaApi.getSession().then(session => {
        const showPaid = session.user.permissions.showPaid ? session.user.permissions.showPaid : undefined;
        const defaultNonFreeFilter = {
          isDefault: true,
          isNonFree: showPaid ? showPaid : false
        };
        storage.setJs("defaultNonFreeFilter", defaultNonFreeFilter, true);
        window.dispatchEvent(new CustomEvent("logoClick", {
          detail: {showPaid: defaultNonFreeFilter.isNonFree},
          bubbles: true
        }));
        scrollPosition.resetToTop();
      });
    };
}]);
