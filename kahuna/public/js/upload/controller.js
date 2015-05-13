import angular from 'angular';
import '../edits/image-editor';

var upload = angular.module('kahuna.upload.controller', ['kahuna.edits.imageEditor']);

upload.controller('UploadCtrl',
                  ['$scope', 'uploadManager', 'mediaApi',
                   function($scope, uploadManager, mediaApi) {

    // TODO: Show multiple jobs?
    this.latestJob = uploadManager.getLatestRunningJob();

    // my uploads
    mediaApi.getSession().then(session => {
        var uploadedBy = session.user.email;
        mediaApi.search('', { uploadedBy }).then(resource => this.myUploads = resource);
    });
}]);
