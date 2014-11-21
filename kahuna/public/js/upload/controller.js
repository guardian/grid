import angular from 'angular';

var upload = angular.module('kahuna.upload.controller', []);

upload.controller('UploadCtrl',
                  ['$scope', 'uploadManager',
                   function($scope, uploadManager) {

    $scope.latestJob = uploadManager.listUploads().slice(-1)[0];
}]);
