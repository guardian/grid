import angular from 'angular';
import template from './upload-jobs.html!text';
import '../../preview/image';
import '../../analytics/track';
import '../../components/gr-delete-image/gr-delete-image';
import '../../image/service';

export var jobs = angular.module('kahuna.upload.jobs', [
    'kahuna.preview.image',
    'gr.image.service',
    'analytics.track'
]);


jobs.controller('UploadJobsCtrl', [
    '$rootScope', '$scope', '$window', 'apiPoll', 'track', 'imageService',
    function($rootScope, $scope, $window, apiPoll, track, imageService) {

    var ctrl = this;

    // State machine-esque async transitions
    const eventName = 'Image upload';

    ctrl.jobs.forEach(jobItem => {
        jobItem.status = 'uploading';

        const timedTrack = track.makeTimedTrack();

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

                // we use the filename of the image if the description is missing
                if (!jobItem.image.data.metadata.description) {
                    const newDescription = jobItem.name
                        .substr(0, jobItem.name.lastIndexOf('.'))
                        .replace('_', ' ');

                    jobItem.image.data.metadata.description = newDescription;
                }

                timedTrack.success(eventName);
            }, error => {
                jobItem.status = 'upload error';
                jobItem.error = error.message;

                timedTrack.failure(eventName, { 'Failed on': 'index' });
            });
        }, error => {
            const message = error.body && error.body.errorMessage || 'unknown';
            jobItem.status = 'upload error';
            jobItem.error = message;

            timedTrack.failure(eventName, { 'Failed on': 'upload' });
        });
    });

    // this needs to be a function due to the stateful `jobItem`
    ctrl.jobImages = () => ctrl.jobs.map(jobItem => jobItem.image);

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
