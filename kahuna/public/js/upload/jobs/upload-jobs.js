import angular from 'angular';
import template from './upload-jobs.html!text';
import '../../preview/image';

export var jobs = angular.module('kahuna.upload.jobs', ['kahuna.preview.image']);


jobs.controller('UploadJobsCtrl',
                ['$window', '$scope', '$q', 'poll',
                 function($window, $scope, $q, poll) {

    // State machine-esque async transitions
    var pollFrequency = 500; // ms
    var pollTimeout   = 20 * 1000; // ms
    this.jobs.forEach(jobItem => {
        jobItem.status = 'uploading';
        jobItem.busy = false;

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
            });
        }, error => {
            var message = error.body.errorMessage;
            jobItem.status = 'upload error';
            jobItem.error = message;
        });
    });

    // this needs to be a function due to the stateful `jobItem`
    this.jobImages = () => this.jobs.map(jobItem => jobItem.image);

    this.updateAllMetadata = (field, value) => {
        // TODO: make sure form is saved first
        this.jobs.forEach(job => {
            // we need to post all the data as that's what it expects.
            var data = angular.extend({},
                job.image.data.userMetadata.data.metadata.data,
                { [field]: value }
            );
            job.image.data.userMetadata.data.metadata.put({ data: data }).then(resource => {
                job.image.data.userMetadata.data.metadata = resource;
            });
        });
    };

    this.updateAllLabels = master => {
        var labels = master.data.map(resource => resource.data);

        this.jobs.forEach(job => {
            var labelResource = job.image.data.userMetadata.data.labels;
            labelResource.post({ data: labels })
                .then(resource => job.image.data.userMetadata.data.labels = resource);
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
