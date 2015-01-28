import angular from 'angular';
import template from './file-uploader.html!text';
import '../edits/results-editor';

export var fileUploader = angular.module('kahuna.upload.fileUploader', [
    'kahuna.edits.resultsEditor'
]);


fileUploader.controller('FileUploaderCtrl',
                  ['$state', 'uploadManager',
                   function($state, uploadManager) {

    var ctrl = this;

    ctrl.uploadFiles = uploadFiles;

    function uploadFiles(files) {
        // Queue up files for upload and go to the upload state to
        // show progress
        uploadManager.upload(files);
        // Force reload, in case we're already in that state
        $state.go('upload', {}, {reload: true});
    }
}]);


fileUploader.directive('fileUploader', [function() {
    return {
        restrict: 'E',
        controller: 'FileUploaderCtrl as fileUploader',
        template: template
    };
}]);
