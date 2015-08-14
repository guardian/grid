import angular from 'angular';

import '../../services/label';

import './gr-add-label.css!';
import template from './gr-add-label.html!text';

export var addLabel = angular.module('gr.addLabel', [
    'kahuna.services.label'
]);

addLabel.controller('GrAddLabelCtrl', ['$window', 'labelService',
    function ($window, labelService) {
        function saveFailed() {
            $window.alert("Something went wrong when saving, please try again!");
        }

        let ctrl = this;

        ctrl.addLabel = () => {
            let label = ($window.prompt('Enter a label:') || '').trim();
            if (label) {
                ctrl.addLabels([label]);
            }
        };

        ctrl.addLabels = labels => {
            ctrl.adding = true;

            labelService.add(ctrl.image, labels)
                .then(image => {
                    ctrl.image = image;
                })
                .catch(saveFailed)
                .finally(() => {
                    ctrl.adding = false;
                });
        };
    }
]);

addLabel.directive('grAddLabel', [function () {
    return {
        restrict: 'E',
        scope: {
            image: '=',
            grSmall: '=?'
        },
        controller: 'GrAddLabelCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
