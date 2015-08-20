import angular from 'angular';
import '../edits/image-editor';
import '../components/gr-delete-image/gr-delete-image';
import '../image/service';
import './prompt/prompt';

var upload = angular.module('kahuna.upload.controller', [
    'kahuna.edits.imageEditor',
    'gr.image.service',
    'kahuna.upload.prompt'
]);

upload.controller('UploadCtrl', [
    '$scope', '$state', '$window', 'uploadManager', 'mediaApi', 'imageService',
    function($scope, $state, $window, uploadManager, mediaApi, imageService) {
        var ctrl = this;

        var deletableImages = new Set();

        // TODO: Show multiple jobs?
        ctrl.latestJob = uploadManager.getLatestRunningJob();

        // my uploads
        mediaApi.getSession().then(session => {
            var uploadedBy = session.user.email;
            mediaApi.search('', { uploadedBy }).then(resource => {

                resource.data.forEach(image => {
                    imageService(image).states.canDelete.then(deletable => {
                        if (deletable) {
                            deletableImages.add(image);
                        }
                    });
                });

                ctrl.myUploads = resource;
            });
        });

        ctrl.canBeDeleted = function (image) {
            return deletableImages.has(image);
        };

        ctrl.onDeleteSuccess = function (resp, image) {
            var index = ctrl.myUploads.data.findIndex(i => i.data.id === image.data.id);

            if (index > -1) {
                ctrl.myUploads.data.splice(index, 1);
                deletableImages.delete(image);
            }
        };

        ctrl.onDeleteError = function (err) {
            if (err.body.errorKey === 'image-not-found') {
                $state.go('upload', {}, {reload: true});
            } else {
                $window.alert(err.body.errorMessage);
            }
        };
    }
]);
