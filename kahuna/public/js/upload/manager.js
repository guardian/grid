import angular from 'angular';

var upload = angular.module('kahuna.upload.manager', []);

upload.factory('uploadManager',
               ['fileUploader',
                function(fileUploader) {

    var jobs = [];


    function createJobItem(file) {
        var request = fileUploader.upload(file);
        return {
            name: file.name,
            size: file.size,
            // TODO: thumbnail? from File? else from request
            idPromise: request.then(resp => resp.data.id)
        };
    }

    function upload(files) {
        var job = files.map(createJobItem);
        jobs.push(job);

        // return $q.all(job)
    }


    function listUploads() {
        return jobs;
    }

    return {
        upload,
        listUploads
    };
}]);


upload.factory('fileUploader',
               ['$q', 'loaderApi',
                function($q, loaderApi) {

    function upload(file) {
        return readFile(file).then(uploadFile);
    }

    function readFile(file) {
        var reader = new FileReader();
        var def = $q.defer();

        reader.addEventListener('load',  event => def.resolve(event.target.result));
        reader.addEventListener('error', def.reject);
        reader.readAsArrayBuffer(file);

        return def.promise;
    }

    function uploadFile(fileData) {
        return loaderApi.load(new Uint8Array(fileData));
    }

    return {
        upload
    };
}]);
