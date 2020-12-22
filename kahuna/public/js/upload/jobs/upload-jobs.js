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
    '$scope',
    '$window',
    'apiPoll',
    'imageService',
    'labelService',
    'presetLabelService',
    'editsService',

    function($rootScope,
            $scope,
            $window,
            apiPoll,
            imageService,
            labelService,
            presetLabelService,
            editsService) {

    var ctrl = this;
    const presetLabels = presetLabelService.getLabels();

    // State machine-esque async transitions
    const eventName = 'Image upload';

    ctrl.jobs.forEach(jobItem => {
        jobItem.status = 'uploading';

        jobItem.resourcePromise.then(resource => {
            jobItem.status = 'indexing';
            jobItem.resource = resource;

            // TODO: grouped polling for all resources we're interested in?
            const findImage = () => resource.get();
            const imageResource = apiPoll(findImage);

            imageResource.then(image => {
                jobItem.status = 'uploaded';
                jobItem.image = image;
                jobItem.thumbnail = image.data.thumbnail;

                imageService(image).states.canDelete.then(deletable => {
                    jobItem.canBeDeleted = deletable;
                });

                // TODO: we shouldn't have to do this ;_;
                // If the image is updated (e.g. label added,
                // archived, etc), refresh the copy we hold
                $rootScope.$on('images-updated', (e, updatedImages) => {
                  const maybeUpdateImage = updatedImages.find(updatedImage => updatedImage.data.id === image.data.id);
                    if (maybeUpdateImage !== undefined) {
                        jobItem.image = maybeUpdateImage;
                    }
                });

                // we use the filename of the image if the description is missing
                if (!jobItem.image.data.metadata.description) {
                    const newDescription = jobItem.name
                        .substr(0, jobItem.name.lastIndexOf('.'))
                        .replace(/_/g, ' ');

                    editsService.updateMetadataField(jobItem.image, 'description', newDescription);
                }

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
        }, error => {
            const reason = error.body && error.body.errorKey;

            const message = reason === 'unsupported-type' ?
                'The Grid only supports JPG, PNG and TIFF images.' +
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
