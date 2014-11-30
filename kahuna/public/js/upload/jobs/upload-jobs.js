import angular from 'angular';
import template from './upload-jobs.html!text';

export var jobs = angular.module('kahuna.upload.jobs', []);


jobs.controller('UploadJobsCtrl',
                ['$scope', '$state', '$q', 'poll', 'mediaApi',
                 function($scope, $state, $q, poll, mediaApi) {

    var pollFrequency = 500; // ms
    var pollTimeout   = 20 * 1000; // ms

    // TODO: show thumbnail while uploading
    // https://developer.mozilla.org/en-US/docs/Using_files_from_web_applications#Example.3A_Showing_thumbnails_of_user-selected_images

    // State machine-esque async transitions
    $scope.jobs.forEach(jobItem => {
        jobItem.status = 'uploading';

        jobItem.idPromise.then(id => {
            jobItem.status = 'indexing';
            jobItem.id = id;

            // TODO: grouped polling for all ids where's interested in
            var findImage = () => mediaApi.find(jobItem.id);
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


    // When the metadata is overriden, we don't know if the resulting
    // image is valid or not. This code checks when the update has
    // been processed and updates the status accordingly.

    // FIXME: re-engineer the metadata/validation architecture so we
    // don't have to wait and poll?
    $scope.overrideMetadata = function(jobItem, metadata) {

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

        var apiSynced = () => mediaApi.find(jobItem.id).then(matchesMetadata);

        var waitIndexed = poll(apiSynced, pollFrequency, pollTimeout);
        waitIndexed.then(image => {
            jobItem.status = image.data.valid ? 'ready' : 'invalid';
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
        controller: 'UploadJobsCtrl as uploadJobsCtrl',
        template: template
    };
}]);
