import angular from 'angular';
import pAll from "p-all";

var upload = angular.module('kahuna.upload.manager', []);

upload.factory('uploadManager',
  ['$q', '$window', 'fileUploader',
    function ($q, $window, fileUploader) {

      var jobs = new Set();

      function createJobItem(file) {
        var request = fileUploader.upload(file);
        // TODO: find out where we can revoke these
        // see: https://developer.mozilla.org/en-US/docs/Web/API/URL.revokeObjectURL
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

      async function uploadFile(file) {
        const jobItem = createJobItem(file);
        const job = [jobItem];
        await jobItem.resourcePromise;
        return job;
      }

      function upload(files) {
        const fileJobs = pAll(
          files.map(
            file => () => uploadFile(file)
          ), {concurrency: 4});
        fileJobs.then(job => {
          jobs.delete(job);
          job.map(jobItem=> $window.URL.revokeObjectURL(jobItem.dataUrl));
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
    function ($q, loaderApi) {

      function upload(file) {
        return readFile(file).then(fileData => {
          return uploadFile(fileData, {filename: file.name});
        });
      }

      function readFile(file) {
        var reader = new FileReader();
        var def = $q.defer();

        reader.addEventListener('load', event => def.resolve(event.target.result));
        reader.addEventListener('error', def.reject);
        reader.readAsArrayBuffer(file);

        return def.promise;
      }

      function uploadFile(fileData, uploadInfo) {
        return loaderApi.load(new Uint8Array(fileData), uploadInfo);
      }

      function loadUriImage(fileUri) {
        return loaderApi.import(fileUri);
      }

      return {
        upload,
        loadUriImage
      };
    }]);
