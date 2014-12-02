import angular from 'angular';

export var archiver = angular.module('kahuna.edits.archiver', []);

archiver.controller('ArchiverCtrl', ['$scope', '$state', '$stateParams', 'mediaApi',
                    function($scope, $state, $stateParams, mediaApi) {

    var ctrl = this;

    ctrl.toggleArchived = toggleArchived;
    ctrl.isArchived = $scope.archived.data;

    function toggleArchived() {
        var setVal = !ctrl.isArchived;
        // FIXME:
        $scope.archived
            .put({ data: setVal })
            .response.then(resp => {
                ctrl.isArchived = resp.body.data;
            });
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
