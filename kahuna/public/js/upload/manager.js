import angular from 'angular';

var upload = angular.module('kahuna.upload.manager', []);

upload.factory('uploadManager',
               ['$q', '$window', 'fileUploader',
                function($q, $window, fileUploader) {

    var jobs = new Set();

    function createJobItem(file, priorJobItem) {
        const request = priorJobItem
          ? priorJobItem.resourcePromise.then(() => fileUploader.upload(file))
          : fileUploader.upload(file);

        var dataUrl = $window.URL.createObjectURL(file);

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

    function upload(files) {
        const totalUploadSize = files.reduce((acc, file) => acc + file.size, 0);
        const maxUploadSize = Math.max(...files.map(file => file.size));
        const containsTiff = files.some(file => file.name.match(/\.tiff?$/i));
        const sequentialUploading = totalUploadSize > 75_000_000 || maxUploadSize > 40_000_000 || containsTiff;

        const job = sequentialUploading
          ? files.reduce((items, file) => [...items, createJobItem(file, items[items.length - 1])], [])
          : files.map(createJobItem);

        var promises = job.map(jobItem => jobItem.resourcePromise);

        jobs.add(job);

        // once all `jobItems` in a job are complete, remove it
        // TODO: potentially move these to a `completeJobs` `Set`
        $q.all(promises).finally(() => {
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

    return {
        upload,
        uploadUri,
        getLatestRunningJob
    };
}]);


upload.factory('fileUploader',
               ['$q', 'loaderApi',
                function($q, loaderApi) {

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
        upload,
        loadUriImage
    };
}]);
