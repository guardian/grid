import angular from 'angular';

var upload = angular.module('kahuna.upload.controller', []);

upload.controller('UploadCtrl',
                  ['uploadManager', 'mediaApi',
                   function(uploadManager, mediaApi) {

    this.latestJob = uploadManager.listUploads().slice(-1)[0];

    mediaApi.getSession().then(session => {
        var uploadedBy = session.user.email;
        this.myUploadsQuery = { uploadedBy };
    });
}]);
