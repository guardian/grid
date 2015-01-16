import angular from 'angular';

var upload = angular.module('kahuna.upload.controller', []);

upload.controller('UploadCtrl',
                  ['uploadManager',
                   function(uploadManager) {

    this.latestJob = uploadManager.listUploads().slice(-1)[0] || [];
}]);
