import angular from 'angular';
import '../../image/service';
import '../../edits/image-editor';
import '../../components/gr-delete-image/gr-delete-image';

import template from './recent-uploads.html';

export let recentUploads = angular.module('kahuna.upload.recent', [
    'kahuna.edits.imageEditor',
    'gr.image.service'
]);

recentUploads.controller('RecentUploadsCtrl', [
    '$rootScope', '$scope', '$window', 'mediaApi', 'imageService',

    function ($rootScope, $scope, $window, mediaApi, imageService) {
        let ctrl = this;

        let deletableImages = new Set();

        mediaApi.getSession().then(session => {
            const uploadedBy = session.user.email;

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
                $rootScope.$on('images-updated', (e, updatedImages) => {
                  const images = ctrl.myUploads.data;
                  images.forEach((originalImage, index) => {
                    const maybeImage = updatedImages.find(updatedImage => originalImage.data.id === updatedImage.data.id);
                    if (maybeImage) {
                      images[index] = maybeImage;
                    }
                  });
                });
            });
        });

        ctrl.canBeDeleted = (image) => deletableImages.has(image.data.id);

        const freeImageDeleteListener = $rootScope.$on('images-deleted', (e, images) => {
            images.forEach(image => {
                const index = ctrl.myUploads.data.findIndex(i => i.data.id === image.data.id);

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

        $scope.$on('$destroy', () => {
            freeImageDeleteListener();
            freeImageDeleteFailListener();
        });
    }
]);

recentUploads.directive('recentUploads', [function() {
    return {
        restrict: 'E',
        controller: 'RecentUploadsCtrl',
        scope: {}, // ensure isolated scope
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
