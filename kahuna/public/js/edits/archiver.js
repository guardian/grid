import angular from 'angular';

export var archiver = angular.module('kahuna.edits.archiver', []);

archiver.controller('ArchiverCtrl', ['$scope', '$window',
                    function($scope, $window) {

    var ctrl = this;

    ctrl.toggleArchived = toggleArchived;
    ctrl.isArchived = $scope.archived.data;
    ctrl.archiving = false;

    function toggleArchived() {
        var setVal = !ctrl.isArchived;
        ctrl.archiving = true;

        // FIXME: theseus should return a `Resource` on `put` that we can
        // update `ctrl.archived` with.
        $scope.archived
            .put({ data: setVal })
            .response.then(
                resp => ctrl.isArchived = resp.body.data,
                resp => $window.alert('Failed to save the changes, please try again.')
            ).finally(() => ctrl.archiving = false);
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
