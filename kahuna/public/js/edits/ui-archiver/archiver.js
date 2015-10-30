import angular from 'angular';
import template from './archiver.html!text';
import './archiver.css!';

import '../../services/archive';

export var archiver = angular.module('kahuna.edits.archiver', [
    'kahuna.services.archive'
]);

archiver.controller('ArchiverCtrl', ['$scope', '$window', 'archiveService', 'onValChange',
                    function($scope, $window, archiveService, onValChange) {

    const ctrl = this;

    ctrl.toggleArchived = toggleArchived;
    ctrl.isArchived = ctrl.image.data.userMetadata.data.archived.data;
    ctrl.archiving = false;

    $scope.$watch(() => ctrl.image.data.userMetadata.data.archived.data, onValChange(newState => {
        ctrl.isArchived = newState;
    }));

    function toggleArchived() {
        ctrl.archiving = true;

        var promise = ctrl.isArchived ?
            archiveService.unarchive(ctrl.image) :
            archiveService.archive(ctrl.image);

        promise
            .catch(()  => $window.alert('Failed to save the changes, please try again.'))
            .finally(() => ctrl.archiving = false);
    }
}]);

archiver.directive('uiArchiver', [function() {
    return {
        restrict: 'E',
        controller: 'ArchiverCtrl',
        controllerAs: 'ctrl',
        scope: {
            image: '=',
            withText: '=',
            disabled: '='
        },
        bindToController: true,
        template: template
    };
}]);
