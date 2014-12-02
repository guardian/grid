import angular from 'angular';
import template from './file-uploader.html!text';

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


fileUploader.directive('fileUploader', [function() {
    return {
        restrict: 'E',
        controller: 'FileUploaderCtrl as fileUploader',
        template: template
    };
}]);
