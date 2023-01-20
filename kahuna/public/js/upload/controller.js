import angular from 'angular';
import './controller.css';
import './prompt/prompt';
import './recent/recent-uploads';

var upload = angular.module('kahuna.upload.controller', [
    'kahuna.upload.prompt',
    'kahuna.upload.recent'
]);

upload.controller('UploadCtrl', ['$window', 'uploadManager', 'mediaApi', function ($window, uploadManager, mediaApi) {
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

    ctrl.displayWarning = (event) => {
      if (uploadManager.getJobs().size > 0) {
        event.returnValue = "Any on-going batch process to update the rights, metadata, or collections will be interrupted when you leave this page. It cannot be resumed later. Are you sure?";
        return "Any on-going batch process to update the rights, metadata, or collections will be interrupted when you leave this page. It cannot be resumed later. Are you sure?";
      }
    };
}]);
