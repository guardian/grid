import angular from 'angular';
import template from './upload-jobs.html!text';
import '../../preview/image';
import '../../analytics/track';

export var jobs = angular.module('kahuna.upload.jobs', ['kahuna.preview.image', 'analytics.track']);


jobs.controller('UploadJobsCtrl',
                ['$scope', 'apiPoll', 'track', function($scope, apiPoll, track) {

    var ctrl = this;

    // State machine-esque async transitions
    var eventName = 'Image upload';

    ctrl.jobs.forEach(jobItem => {
        jobItem.status = 'uploading';

        const timedTrack = track.makeTimedTrack();

        jobItem.resourcePromise.then(resource => {
            jobItem.status = 'indexing';
            jobItem.resource = resource;

            // TODO: grouped polling for all resources we're interested in?
            var findImage = () => resource.get();
            var imageResource = apiPoll(findImage);

            imageResource.then(image => {
                jobItem.status = 'uploaded';
                jobItem.image = image;
                jobItem.thumbnail = image.data.thumbnail;

                timedTrack.success(eventName);
            }, error => {
                jobItem.status = 'upload error';
                jobItem.error = error.message;

                timedTrack.failure(eventName, { 'Failed on': 'index' });
            });
        }, error => {
            var message = error.body && error.body.errorMessage || 'unknown';
            jobItem.status = 'upload error';
            jobItem.error = message;

            timedTrack.failure(eventName, { 'Failed on': 'upload' });
        });
    });

    // this needs to be a function due to the stateful `jobItem`
    ctrl.jobImages = () => ctrl.jobs.map(jobItem => jobItem.image);

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
