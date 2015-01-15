import angular from 'angular';

var upload = angular.module('kahuna.upload.controller', []);

upload.controller('UploadCtrl',
                  ['$scope', 'uploadManager',
                   function($scope, uploadManager) {

    this.latestJob = uploadManager.listUploads().slice(-1)[0] || [];
    this.getEdits = () => this.latestJob.map(job => job.image.data.userMetadata);
    this.onBatchUpdate = () => {

    }
}]);
