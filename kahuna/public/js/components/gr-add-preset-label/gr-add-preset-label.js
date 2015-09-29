import angular from 'angular';

import './gr-add-preset-label.css!';
import template from './gr-add-preset-label.html!text';

import '../../directives/gr-auto-focus';
import '../../services/preset-label';

export var addPresetLabel = angular.module('gr.addPresetLabel', [
    'gr.autoFocus',
    'kahuna.services.presetLabel'
]);

addPresetLabel.controller('GrAddPresetLabelCtrl', [
    '$window', 'presetLabelService',
    function ($window, presetLabelService) {

        let ctrl = this;

        ctrl.active = false;

        ctrl.save = () => {
            let newPresetLabelList = ctrl.newLabel.split(',').map(e => e.trim());

            if (newPresetLabelList) {
                save(newPresetLabelList);
            }
        };

        ctrl.cancel = reset;

        function save(label) {
            ctrl.adding = true;
            ctrl.active = false;

            let presetLabels = presetLabelService.getLabels();

            //currently only adds first label
            if (presetLabels.indexOf(label[0]) === -1) {
                let updatedPresetLabels = presetLabels.concat(label);

                presetLabelService.setLabels(updatedPresetLabels);
            }

            reset();
            ctrl.adding = false;

        }

        function reset() {
            ctrl.newLabel = '';
            ctrl.active = false;
        }

    }
]);

addPresetLabel.directive('grAddPresetLabel', [function () {
    return {
        restrict: 'E',
        scope: {
            active: '='
        },
        controller: 'GrAddPresetLabelCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
