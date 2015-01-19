import angular from 'angular';
import template from './upload-jobs.html!text';

export var jobs = angular.module('kahuna.upload.jobs', []);


jobs.controller('UploadJobsCtrl',
                ['$scope', '$state', '$q', 'poll', 'editsApi',
                 function($scope, $state, $q, poll, editsApi) {

    var pollFrequency = 500; // ms
    var pollTimeout   = 20 * 1000; // ms

    // TODO: show thumbnail while uploading
    // https://developer.mozilla.org/en-US/docs/Using_files_from_web_applications#Example.3A_Showing_thumbnails_of_user-selected_images

    // State machine-esque async transitions
    $scope.jobs.forEach(jobItem => {
        jobItem.status = 'uploading';

        jobItem.resourcePromise.then(resource => {
            jobItem.status = 'indexing';
            jobItem.resource = resource;

            // TODO: grouped polling for all resources whe're interested in?
            // TODO: update theseus so getResponse isn't needed
            var findImage = () => resource.get().getResponse();
            var imageResponse = poll(findImage, pollFrequency, pollTimeout);
            imageResponse.then(image => {
                jobItem.status = image.data.valid ? 'ready' : 'invalid';
                jobItem.image = image;
                jobItem.thumbnail = image.data.thumbnail;
            });
        }, error => {
            var message = error.body.errorMessage;
            jobItem.status = 'upload-error';
            jobItem.error = message;
        });
    });

    var onMetadataUpdateDef = editsApi.onMetadataUpdate(({ resource, metadata, id }) => {
        var jobItem = $scope.jobs.find(job => job.image.data.id === id);
        overrideMetadata(jobItem, metadata);
    });
    $scope.$on("$destroy", onMetadataUpdateDef.resolve);


    // When the metadata is overriden, we don't know if the resulting
    // image is valid or not. This code checks when the update has
    // been processed and updates the status accordingly.

    // FIXME: re-engineer the metadata/validation architecture so we
    // don't have to wait and poll?
    function overrideMetadata(jobItem, metadata) {

        jobItem.status = 're-indexing';

        // Wait until all values of `metadata' are seen in the media API
        function matchesMetadata(image) {
            var imageMetadata = image.data.metadata;
            var matches = Object.keys(metadata).every(key => imageMetadata[key] === metadata[key]);
            if (matches) {
                return image;
            } else {
                // not matching yet, keep polling
                return $q.reject('no match');
            }
        }

        // TODO: update theseus so getResponse isn't needed
        var apiSynced = () => jobItem.resource.get().getResponse().then(matchesMetadata);

        var waitIndexed = poll(apiSynced, pollFrequency, pollTimeout);
        waitIndexed.then(image => {
            jobItem.status = image.data.valid ? 'ready' : 'invalid';
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
