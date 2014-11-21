import angular from 'angular';

export var fileUploader = angular.module('kahuna.upload.fileUploader', []);


fileUploader.controller('FileUploaderCtrl',
                  ['$state', 'uploadManager',
                   function($state, uploadManager) {

    var ctrl = this;

    ctrl.uploadFiles = uploadFiles;


    function uploadFiles(files) {
        // Queue up files for upload and go to the upload state to
        // show progress
        uploadManager.upload(files);
        $state.go('upload');
    }
}]);


fileUploader.directive('fileUploader', ['jsDirectory', function(jsDirectory) {
    return {
        restrict: 'E',
        controller: 'FileUploaderCtrl as fileUploader',
        templateUrl: jsDirectory + '/upload/file-uploader.html'
    };
}]);
