import angular from 'angular';
import template from './rights.html!text';

import './service';

export var rights = angular.module('kahuna.edits.rights', ['kahuna.edits.service']);

rights.controller('RightsCtrl', ['$window', 'editsService', function($window, editsService) {

    var ctrl = this;

    ctrl.saving = false;
    // TODO: potentially get this from an API
    ctrl.rights = [
        "PR image",
        "handout"
    ];

    ctrl.imageRights = angular.copy({}, ctrl.originalImageRights);

    ctrl.hasRight = right => !!findResource(right, ctrl.imageRights);

    ctrl.toggleRight = right => {
        const resource = findResource(right, ctrl.imageRights);
        const promise = resource ? del(resource) : save(right);

        ctrl.saving = true;

        promise
            .then(rights => ctrl.imageRights = rights)
            .catch(() => $window.alert('Failed to save the changes, please try again.'))
            .finally(() => ctrl.saving = false);
    };

    function save(right) {
        return editsService.update(ctrl.imageRights, [right], ctrl.image);
    }

    function del(rightResource) {
        return editsService.deleteFromCollection(rightResource, ctrl.imageRights, ctrl.image);
    }

    function findResource(right, imageRights) {
        return imageRights.data.find(imageRight => imageRight.data === right);
    }

}]);


rights.directive('gridRights', [function() {
    return {
        restrict: 'E',
        controller: 'RightsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            originalImageRights: '=rights',
            image: '='
        },
        template: template
    };
}]);
