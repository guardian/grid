import angular from 'angular';

var upload = angular.module('kahuna.upload.manager', []);

upload.factory('uploadManager',
               ['$q', '$window', 'fileUploader',
                function($q, $window, fileUploader) {

    var jobs = new Set();
    var completedJobs = new Set();

    function createJobItem(file, preSignedUrl) {
        // var request = fileUploader.upload(file);
        const request = fetch(preSignedUrl, {
          method: "PUT",
          body: file,
          headers: {
            // TODO x-amz-meta (probably needs to be added when pre-signing too
          }
        });
        const dataUrl = $window.URL.createObjectURL(file);

        return {
            name: file.name,
            size: file.size,
            dataUrl: dataUrl,
            resourcePromise: request
        };
    }
    function createUriJobItem(fileUri) {
        var request = fileUploader.loadUriImage(fileUri);

        return {
            name: fileUri,
            dataUrl: fileUri,
            resourcePromise: request
        };
    }

    async function upload(files) {

        const preSignedPutUrls = await fileUploader.prepare(files.map(_ => _.name));

        console.log(preSignedPutUrls);

        var job = files.map(file => createJobItem(file, preSignedPutUrls[file.name]));
        var promises = job.map(jobItem => jobItem.resourcePromise);

        jobs.add(job);

        // once all `jobItems` in a job are complete, remove it
        // TODO: potentially move these to a `completeJobs` `Set`
        $q.all(promises).finally(() => {
          completedJobs.add(job);
          jobs.delete(job);
          job.map(jobItem => {
            $window.URL.revokeObjectURL(jobItem.dataUrl);
          });
        });
    }

    function uploadUri(uri) {
        var jobItem = createUriJobItem(uri);
        var promise = jobItem.resourcePromise;
        var job = [jobItem];

        jobs.add(job);

        // once all `jobItems` in a job are complete, remove it
        // TODO: potentially move these to a `completeJobs` `Set`
        promise.finally(() => jobs.delete(job));
    }

    function getLatestRunningJob() {
        return jobs.values().next().value;
    }

    function getJobs() {
        return jobs;
    }

    function getCompletedJobs() {
        return completedJobs;
    }

    return {
        upload,
        uploadUri,
        getLatestRunningJob,
        getJobs,
        getCompletedJobs
    };
}]);


upload.factory('fileUploader',
               ['$q', 'loaderApi',
                function($q, loaderApi) {

    function prepare(filenames) {
        return loaderApi.prepare(filenames);
    }

    function upload(file) {
      return uploadFile(file, {filename: file.name});
    }

    function uploadFile(file, uploadInfo) {
        return loaderApi.load(file, uploadInfo);
    }

    function loadUriImage(fileUri) {
        return loaderApi.import(fileUri);
    }

    return {
        prepare,
        upload,
        loadUriImage
    };
}]);
