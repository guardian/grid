import angular from 'angular';

import '../rx-helpers/rx-helpers';

import template from './archiver.html!text';

export const archiver = angular.module('gr.archiver', ['rx.helpers']);

archiver.controller('grArchiverCtrl', ['injectValue$', function(injectValue$) {

    var ctrl = this;

    const { count$, archivedCount$, notArchivedCount$, hasMixed$ } = ctrl.service;

    injectValue$(ctrl, 'count', count$);
    injectValue$(ctrl, 'archivedCount', archivedCount$);
    injectValue$(ctrl, 'notArchivedCount', notArchivedCount$);
    injectValue$(ctrl, 'hasMixed', hasMixed$);

    ctrl.archive = () => {
        ctrl.archiving = true;
        ctrl.service.archive().then(() => ctrl.archiving = false);
    };
    ctrl.unarchive = () => {
        ctrl.archiving = true;
        ctrl.service.unarchive().then(() => ctrl.archiving = false);
    };
}]);

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
