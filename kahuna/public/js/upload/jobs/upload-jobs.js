import angular from 'angular';
import template from './upload-jobs.html!text';
import '../../preview/image';

export var jobs = angular.module('kahuna.upload.jobs', ['kahuna.preview.image']);


jobs.controller('UploadJobsCtrl',
                ['poll', function(poll) {

    // State machine-esque async transitions
    var pollFrequency = 500; // ms
    var pollTimeout   = 20 * 1000; // ms
    this.jobs.forEach(jobItem => {
        jobItem.status = 'uploading';

        jobItem.resourcePromise.then(resource => {
            jobItem.status = 'indexing';
            jobItem.resource = resource;

            // TODO: grouped polling for all resources we're interested in?
            var findImage = () => resource.get();
            var imageResource = poll(findImage, pollFrequency, pollTimeout);
            imageResource.then(image => {
                jobItem.status = 'uploaded';
                jobItem.image = image;
                jobItem.thumbnail = image.data.thumbnail;
            }, error => {
                jobItem.status = 'upload error';
                jobItem.error = error.message;
            });
        }, error => {
            var message = error.body.errorMessage;
            jobItem.status = 'upload error';
            jobItem.error = message;
        });
    });

    // this needs to be a function due to the stateful `jobItem`
    this.jobImages = () => this.jobs.map(jobItem => jobItem.image);

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
