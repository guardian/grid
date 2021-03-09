import angular from 'angular';
import './controller.css';
import './prompt/prompt';
import './recent/recent-uploads';

var upload = angular.module('kahuna.upload.controller', [
    'kahuna.upload.prompt',
    'kahuna.upload.recent'
]);

upload.controller('UploadCtrl', ['uploadManager', 'mediaApi', function(uploadManager, mediaApi) {
    var ctrl = this;

    mediaApi.getSession().then(session => {
        ctrl.canUpload = session.user.permissions.canUpload;
    });
    // TODO: Show multiple jobs?
    ctrl.latestJob = uploadManager.getLatestRunningJob();
}]);
