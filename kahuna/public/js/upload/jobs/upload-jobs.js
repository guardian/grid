import angular from 'angular';
import template from './upload-jobs.html!text';
import '../../preview/image';

export var jobs = angular.module('kahuna.upload.jobs', ['kahuna.preview.image']);


jobs.controller('UploadJobsCtrl',
                ['$window', '$scope', '$q', 'poll', 'editsApi',
                 function($window, $scope, $q, poll, editsApi) {

    // TODO: show thumbnail while uploading
    // https://developer.mozilla.org/en-US/docs/Using_files_from_web_applications#Example.3A_Showing_thumbnails_of_user-selected_images

    var pollFrequency = 500; // ms
    var pollTimeout   = 20 * 1000; // ms
    $scope.jobs.forEach(jobItem => {
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
            states.set(jobItem, 'upload error');
            jobItem.error = message;
        });
    });

    $scope.jobImages = () => $scope.jobs.map(jobItem => jobItem.image);

    this.updateAllMetadata = (field, value) => {
        // TODO: make sure form is saved first
        $scope.jobs.forEach(job => {
            // we need to post all the data as that's what it expects.
            var data = angular.extend({}, job.image.data.userMetadata.data.metadata.data, { [field]: value });
            job.image.data.userMetadata.data.metadata.put({ data: data }).then(resource => {
                job.image.data.userMetadata.data.metadata = resource;
            });
        });
    };

    this.updateAllLabels = master => {
        var labels = master.data.map(resource => resource.data);

        $scope.jobs.forEach(job => {
            var labelResource = job.image.data.userMetadata.data.labels;
            labelResource.post({ data: labels })
                .then(resource => job.image.data.userMetadata.data.labels = resource);
        });
    };

    // FIXME: Why do we have to filter `job.image` here when it's already
    // filtered in the template
    this.getAllEditsOfType = (type, jobs) =>
        jobs.filter(job => job.image)
            .map(job => job.image.data.userMetadata.data[type]);

    this.getLabelsArrFrom = image =>
        image.data.userMetadata.data.labels.data.map(label => label.data);

    this.updateLabels = jobs => resource =>
        jobs.forEach(job => job.image.data.userMetadata.data.labels = resource);

    this.jobsExcept = exclude => $scope.jobs.filter(job => job !== exclude);

}]);


jobs.directive('uiUploadJobs', [function() {
    return {
        restrict: 'E',
        scope: {
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            jobs: '='
        },
        controller: 'UploadJobsCtrl as uploadJobsCtrl',
        template: template
    };
}]);
