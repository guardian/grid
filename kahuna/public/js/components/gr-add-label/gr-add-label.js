import angular from 'angular';

import '../../services/label';

import './gr-add-label.css!';
import template from './gr-add-label.html!text';

import '../../directives/gr-auto-focus';

export var addLabel = angular.module('gr.addLabel', [
    'kahuna.services.label',
    'gr.autoFocus'
]);

addLabel.controller('GrAddLabelCtrl', ['$window', 'labelService',
    function ($window, labelService) {


        function saveFailed() {
            $window.alert('Something went wrong when saving, please try again!');
        }

        let ctrl = this;

        ctrl.active = false;

        ctrl.addLabel = function() {
            let labelList = ctrl.newLabel.split(',').map(e => e.trim());

            if (labelList) {
                ctrl.addLabels(labelList);
                ctrl.newLabel = '';
                ctrl.active = false;
            }
        };

        ctrl.cancel = function () {
            ctrl.newLabel = '';
            ctrl.active = false;
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
            grSmall: '=?',
            active: '='
        },
        controller: 'GrAddLabelCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
