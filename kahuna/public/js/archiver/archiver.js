import angular from 'angular';

import template from './archiver.html!text';

export const archiver = angular.module('gr.archiver', []);

archiver.controller('grArchiverCtrl', function() {

    var ctrl = this;
    ctrl.count = 0;
    ctrl.notArchivedCount = 0;
    ctrl.archivedCount = 0;
    ctrl.hasMixed = false;
    ctrl.archiving = false;

    ctrl.service.count$.subscribe(i => ctrl.count = i);
    ctrl.service.archivedCount$.subscribe(i => ctrl.archivedCount = i);
    ctrl.service.notArchivedCount$.subscribe(i => ctrl.notArchivedCount = i);
    ctrl.service.hasMixed$.subscribe(hasMixed => ctrl.hasMixed = hasMixed);

    ctrl.archive = () => {
        ctrl.archiving = true;
        ctrl.service.archive().then(() => ctrl.archiving = false);
    };
    ctrl.unarchive = () => {
        ctrl.archiving = true;
        ctrl.service.unarchive().then(() => ctrl.archiving = false);
    };
});

archiver.directive('grArchiver', function() {
    return {
        restrict: 'E',
        controller: 'grArchiverCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            service: '=grService'
        },
        template: template
    };
});
