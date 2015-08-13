import angular from 'angular';
import template from './archiver.html!text';

import imageStream from '../image/stream';

import '../archiver/service';

export var archiver = angular.module('kahuna.edits.archiver', ['gr.archiver.service']);

archiver.controller('ArchiverCtrl', ['$window', 'archiverService',
                    function($window, archiverService) {

    var ctrl = this;

    const imageStream$ = imageStream([ctrl.image]).getObservable();
    const service = archiverService(imageStream$);

    ctrl.saving = false;
    ctrl.isArchived = () => ctrl.image.data.userMetadata.data.archived.data;

    ctrl.archive = () => {
        ctrl.saving = true;
        service.
            archive().
            catch(error).
            finally(saved);
    };

    ctrl.unarchive = () => {
        ctrl.saving = true;
        service.
            unarchive().
            catch(error).
            finally(saved);
    };

    function error() {
        $window.alert('Failed to save the changes, please try again.');
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
