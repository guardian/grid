import angular from 'angular';
import './prompt/prompt';
import './recent/recent-uploads';

var upload = angular.module('kahuna.upload.controller', [
    'kahuna.upload.prompt',
    'kahuna.upload.recent'
]);

upload.controller('UploadCtrl', ['uploadManager', function(uploadManager) {
    var ctrl = this;

    // TODO: Show multiple jobs?
    ctrl.latestJob = uploadManager.getLatestRunningJob();
}]);
