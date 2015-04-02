import angular from 'angular';
import template from './rights.html!text';

import './service';

export var rights = angular.module('kahuna.edits.rights', ['kahuna.edits.service']);

rights.controller('RightsCtrl', ['editsService', function(editsService) {

    var ctrl = this;

    // TODO: potentially get this from an API
    ctrl.rights = [
        "PR image",
        "handout"
    ];

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

        ctrl.save([...rightsSet]);
    };

    ctrl.save = data => editsService.update(ctrl.imageRights, data, ctrl.image);

}]);


rights.directive('gridRights', [function() {
    return {
        restrict: 'E',
        controller: 'RightsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            imageRights: '=rights',
            image: '='
        },
        template: template
    };
}]);
