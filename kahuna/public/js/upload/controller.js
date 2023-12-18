import angular from 'angular';
import './controller.css';
import './prompt/prompt';
import './recent/recent-uploads';

var upload = angular.module('kahuna.upload.controller', [
    'kahuna.upload.prompt',
    'kahuna.upload.recent'
]);

upload.controller('UploadCtrl', ['uploadManager', 'mediaApi', '$scope', function (uploadManager, mediaApi, $scope) {
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

    ctrl.getUploadsNotCompleted = () => {
      const data = uploadManager.getUploadsInProgress();
      const list = data.map(upload => {
        const time = new Date(upload.uploadTime).valueOf();
        return {
         name: upload.fileName, status: upload.status, time
        };
      });
      return JSON.stringify(list);
    };

    ctrl.displayWarning = (e) => {
      if (uploadManager.getJobs().size > 0 || isOngoingUploadJobs()) {
        if (confirm("You have uploads in progress. Are you sure you want to leave this page?") === false) {
          e.preventDefault();
        }
        return "";
      }
    };
}]);
