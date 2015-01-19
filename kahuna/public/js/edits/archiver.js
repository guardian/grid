import angular from 'angular';
import template from './archiver.html!text';


export var archiver = angular.module('kahuna.edits.archiver', []);

archiver.controller('ArchiverCtrl', ['$scope', '$window',
                    function($scope, $window) {

    var ctrl = this;

    ctrl.toggleArchived = toggleArchived;
    ctrl.isArchived = ctrl.archived.data;
    ctrl.archiving = false;

    function toggleArchived() {
        var setVal = !ctrl.isArchived;
        ctrl.archiving = true;

        // FIXME: theseus should return a `Resource` on `put` that we can
        // update `ctrl.archived` with.
        ctrl.archived
            .put({ data: setVal })
            .response.then(
                resp => ctrl.isArchived = resp.body.data,
                ()   => $window.alert('Failed to save the changes, please try again.')
            ).finally(() => ctrl.archiving = false);
    }
}]);

archiver.directive('uiArchiver', [function() {
    return {
        restrict: 'E',
        controller: 'ArchiverCtrl as archiver',
        scope: {
            archived: '=',
            withText: '='
        },
        bindToController: true,
        template: template
    };
}]);
