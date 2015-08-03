import angular from 'angular';
import template from './archiver.html!text';

import imageStream from '../image/streamService';

import '../archiver/service';

export var archiver = angular.module('kahuna.edits.archiver', ['gr.archiver.service']);

archiver.controller('ArchiverCtrl', ['$window', 'archiverService',
                    function($window, archiverService) {

    var ctrl = this;

    const service = archiverService(imageStream([ctrl.image]).images$);

    ctrl.saving = false;
    ctrl.isArchived = ctrl.image.data.userMetadata.data.archived.data;

    ctrl.archive = () => {
        ctrl.saving = true;
        service.archive().then(() => {
            ctrl.isArchived = true;
        })
        .catch(error)
        .finally(saved);
    }

    ctrl.unarchive = () => {
        ctrl.saving = true;
        service.unarchive().then(() => {
            ctrl.isArchived = false;
        })
        .catch(error)
        .finally(saved);;
    }

    function error() {
        $window.alert('Failed to save the changes, please try again.')
    }

    function saved() {
        ctrl.saving = false;
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
