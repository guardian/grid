import angular from 'angular';
import template from './rights.html!text';

export var rights = angular.module('kahuna.edits.rights', []);

rights.controller('RightsCtrl', [function() {

    var ctrl = this;

    // FIXME: quite stateful, quite crap
    // TODO: perhaps look into abstracting a collection of radios into a directive
    var rightsSet = new Set();
    ctrl.rightExists = right => rightsSet.has(right);
    ctrl.toggleRight = right => {
        if (rightsSet.has(right)) {
            rightsSet.delete(right);
        } else {
            rightsSet.add(right);
        }
    };

    ctrl.rights = [
        "PR image",
        "handout"
    ];
}]);


rights.directive('gridRights', [function() {
    return {
        restrict: 'E',
        controller: 'RightsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            //rights: '='
        },
        template: template
    };
}]);
