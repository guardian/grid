import angular from 'angular';

var search = angular.module('kahuna.search.controller', []);

search.controller('SearchCtrl',
                  ['$scope', '$state', 'uploadManager',
                   function($scope, $state, uploadManager) {

    var ctrl = this;
    ctrl.uploadFiles = uploadFiles;

    function uploadFiles(files) {
        uploadManager.upload(files);
        $state.go('upload');
    }
}]);
