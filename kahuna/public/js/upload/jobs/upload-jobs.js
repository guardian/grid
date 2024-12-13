import angular from 'angular';
import template from './upload-jobs.html';
import '../../preview/image';
import '../../components/gr-delete-image/gr-delete-image';
import '../../image/service';
import '../../edits/service';
import '../../services/label';
import '../../services/preset-label';

export var jobs = angular.module('kahuna.upload.jobs', [
    'kahuna.preview.image',
    'gr.image.service',
    'kahuna.services.label',
    'kahuna.services.presetLabel',
    'kahuna.edits.service'
]);


jobs.controller('UploadJobsCtrl', [
    '$rootScope',
    '$q',
    '$scope',
    '$window',
    'apiPoll',
    'imageService',
    'labelService',
    'presetLabelService',
    'editsService',

    function($rootScope,
            $q,
            $scope,
            $window,
            apiPoll,
            imageService,
            labelService,
            presetLabelService,
            editsService) {

    var ctrl = this;

    ctrl.$onInit = () => {
      const presetLabels = presetLabelService.getLabels();

      ctrl.remaining = ctrl.jobs.length;

      // State machine-esque async transitions
      const eventName = 'Image upload';

      function getUploadStatus(image, extraCallback) {
          return image.get().then((status) => {
              extraCallback(status);
              if (status.data.status === 'COMPLETED' || status.data.status === 'FAILED') {
                  return status;
              } else {
                  return $q.reject();
              }
          });
      }
      ctrl.jobs.forEach(jobItem => {
          jobItem.status = 'uploading';

          jobItem.resourcePromise.then(resource => {
              jobItem.resource = resource;

              const imageUploadStatusResource = apiPoll(() => getUploadStatus(resource, (status) => {
                if (status.data.status === 'QUEUED' && jobItem.status !== 'queued') {
                  jobItem.status = 'queued';
                  // decrement the counter blocking us from closing the page once things are at least queued
                  // ctrl.remaining -= 1; //TODO need to think about this since its also done in the completed/failed blocks below
                } else if (status.data.status !== 'QUEUED') {
                  jobItem.status = 'indexing';
                }
              }));
              imageUploadStatusResource.then(status => {
                  if (status.data.status === 'FAILED'){
                      jobItem.status = 'upload error';
                      jobItem.error = status.data.errorMessage;
                      ctrl.remaining -= 1;
                  } else if (status.data.status === 'COMPLETED'){
                      const findImage = () => status.get();
                      const imageResource = apiPoll(findImage);
                      imageResource.then(image => {
                          jobItem.status = 'uploaded';
                          jobItem.image = image;
                          jobItem.thumbnail = image.data.thumbnail;

                          ctrl.remaining -= 1;

                          imageService(image).states.canDelete.then(deletable => {
                              jobItem.canBeDeleted = deletable;
                              if (image.data.softDeletedMetadata !== undefined) { jobItem.isDeleted = true; }
                          });

                          // If the image is updated (e.g. label added,
                          // archived, etc), refresh the copy we hold
                          $rootScope.$on('images-updated', (e, updatedImages) => {
                            const maybeUpdateImage = updatedImages.find(updatedImage => updatedImage.data.id === image.data.id);
                              if (maybeUpdateImage !== undefined) {
                                  jobItem.image = maybeUpdateImage;
                              }
                          });

                          if (presetLabels.length > 0) {
                              labelService.add(image, presetLabels);
                          }

                          $rootScope.$emit(
                            'track:event',
                            eventName,
                            null,
                            'Success',
                            null,
                            { 'Labels' : presetLabels.length}
                          );
                      }, error => {
                          jobItem.status = 'upload error';
                          jobItem.error = error.message;

                          $rootScope.$emit(
                            'track:event',
                            eventName,
                            null,
                            'Failure',
                            null,
                            { 'Failed on': 'index'}
                          );
                      });
                  }
            }, error => {
                jobItem.status = 'upload error';
                jobItem.error = error.message;

                $rootScope.$emit(
                  'track:event',
                  eventName,
                  null,
                  'Failure',
                  null,
                  { 'Failed on': 'index'}
                );
            });
          }, error => {
              const reason = error.body && error.body.errorKey;

              const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

              const message = reason === 'unsupported-type' ?
              `${capitalize(window._clientConfig.systemName)} only supports JPG, PNG and TIFF images.` +
                  ' Please convert the image and try again.' :
                  error.body && error.body.errorMessage || 'unknown';

              jobItem.status = 'upload error';
              jobItem.error = message;

              $rootScope.$emit(
                'track:event',
                eventName,
                null,
                'Failure',
                null,
                { 'Failed on': 'upload'}
              );
          });
      });

      // this needs to be a function due to the stateful `jobItem`
      ctrl.jobImages = () => ctrl.jobs.map(jobItem => jobItem.image);

      ctrl.removeJob = (job) => {
          const index = ctrl.jobs.findIndex(j => j.name === job.name);

          if (index > -1) {
              ctrl.jobs.splice(index, 1);
          }
      };

      const freeImageDeleteListener = $rootScope.$on('images-deleted', (e, images) => {
          images.forEach(image => {
              var index = ctrl.jobs.findIndex(i => i.image.data.id === image.data.id);

              if (index > -1) {
                  ctrl.jobs.splice(index, 1);
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
    };
}]);


jobs.directive('uiUploadJobs', [function() {
    return {
        restrict: 'E',
        scope: {
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            jobs: '='
        },
        controller: 'UploadJobsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
