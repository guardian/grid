import angular from 'angular';

export var archiver = angular.module('kahuna.edits.archiver', []);

archiver.controller('ArchiverCtrl', ['$scope', '$state', '$stateParams', 'mediaApi',
                 function($scope, $state, $stateParams, mediaApi) {

    var ctrl = this;

    ctrl.toggleArchived = toggleArchived;

    function toggleArchived(archived) {
        var setVal = !archived.data;
        console.log(archived
            .put({ data: setVal }).get())



    }
}]);

archiver.directive('archiver', ['jsDirectory', function(jsDirectory) {
    return {
        restrict: 'E',
        controller: 'ArchiverCtrl as archiver',
        scope: {
            archived: '='
        },
        templateUrl: jsDirectory + '/edits/archiver.html'
    };
}]);