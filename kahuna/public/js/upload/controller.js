import angular from 'angular';
import './controller.css';
import './prompt/prompt';
import './recent/recent-uploads';

var upload = angular.module('kahuna.upload.controller', [
    'kahuna.upload.prompt',
    'kahuna.upload.recent'
]);

upload.controller('UploadCtrl', ['uploadManager', 'mediaApi', function (uploadManager, mediaApi) {
    var ctrl = this;

    window.onbeforeunload = function (e) {
      ctrl.displayWarning(e);
    };

    ctrl.supportEmailLink = window._clientConfig.supportEmail;
    ctrl.systemName = window._clientConfig.systemName;

    mediaApi.canUserUpload().then(canUpload => {
        ctrl.canUpload = canUpload;
    });

    // TODO: Show multiple jobs?
    ctrl.latestJob = uploadManager.getLatestRunningJob();

    ctrl.displayWarning = () => {
      if (uploadManager.getJobs().size > 0) {
        return "";
      }
    };
}]);
