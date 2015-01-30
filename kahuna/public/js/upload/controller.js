import angular from 'angular';
import '../edits/image-editor';

var upload = angular.module('kahuna.upload.controller', ['kahuna.edits.imageEditor']);

upload.controller('UploadCtrl',
                  ['$scope', 'uploadManager', 'mediaApi', 'editsApi', 'poll',
                   function($scope, uploadManager, mediaApi, editsApi, poll) {

    this.latestJob = uploadManager.listUploads().slice(-1)[0];

    // my uploads
    mediaApi.getSession().then(session => {
        var uploadedBy = session.user.email;
        mediaApi.search('', { uploadedBy }).then(resource => this.myUploads = resource);
    });
}]);
