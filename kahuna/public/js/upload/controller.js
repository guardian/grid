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
    '$rootScope', '$scope', '$state', '$window', 'uploadManager', 'mediaApi', 'imageService',
    function($rootScope, $scope, $state, $window, uploadManager, mediaApi, imageService) {
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
                            deletableImages.add(image.data.id);
                        }
                    });
                });

                ctrl.myUploads = resource;

                // TODO: we shouldn't have to do this ;_;
                // If an image is updated (e.g. label added,
                // archived, etc), refresh the copy we hold
                $rootScope.$on('image-updated', (e, updatedImage) => {
                    const updatedIndex = ctrl.myUploads.data.findIndex(image => image.data.id === updatedImage.data.id);
                    if (updatedIndex !== -1) {
                        ctrl.myUploads.data[updatedIndex] = updatedImage;
                    }
                });

            });
        });

        ctrl.canBeDeleted = function (image) {
            return deletableImages.has(image.data.id);
        };

        const freeImageDeleteListener = $rootScope.$on('images-deleted', (e, images) => {
            images.forEach(image => {
                var index = ctrl.myUploads.data.findIndex(i => i.data.id === image.data.id);

                if (index > -1) {
                    ctrl.myUploads.data.splice(index, 1);
                    deletableImages.delete(image);
                }
            });
        });

        const freeImageDeleteFailListener = $rootScope.$on('image-delete-failure', (err, image) => {
            if (err.body && err.body.errorMessage) {
                $window.alert(err.body.errorMessage);
            } else {
                $window.alert(`Failed to delete image ${image.data.id}`);
            }
        });

        $scope.$on('$destroy', function() {
            freeImageDeleteListener();
            freeImageDeleteFailListener();
        });
    }
]);
