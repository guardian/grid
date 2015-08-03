import angular from 'angular';
import '../edits/image-editor';

var upload = angular.module('kahuna.upload.controller', ['kahuna.edits.imageEditor']);

upload.controller('UploadCtrl',
                  ['uploadManager',
                   function(uploadManager) {

    // TODO: Show multiple jobs?
    this.latestJob = uploadManager.getLatestRunningJob();
}]);
