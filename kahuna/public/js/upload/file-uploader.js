import angular from 'angular';
import template from './file-uploader.html!text';

import '../analytics/track';
import '../directives/gr-file-change';

export var fileUploader = angular.module('kahuna.upload.fileUploader', [
    'analytics.track',
    'gr.fileChange'
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
        // TODO: Don't do this as it reloads "Your uploads" too
        $state.go('upload', {}, {reload: true});
    }
}]);


fileUploader.directive('fileUploader', [function() {
    return {
        restrict: 'E',
        controller: 'FileUploaderCtrl',
        controllerAs: 'ctrl',
        template: template,
        link: function(_, element) {
            // fake the click on the file input
            element.on('click', () => {
                element.find('input[type="file"]')[0].click();
            });
        }
    };
}]);
