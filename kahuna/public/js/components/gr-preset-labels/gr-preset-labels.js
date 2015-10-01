import angular from 'angular';

import './gr-preset-labels.css!';
import template from './gr-preset-labels.html!text';

import '../../directives/gr-auto-focus';
import '../../services/preset-label';

export var presetLabels = angular.module('gr.presetLabels', [
    'gr.autoFocus',
    'kahuna.services.presetLabel'
]);

presetLabels.controller('GrPresetLabelsCtrl', [
    '$window', 'presetLabelService',
    function ($window, presetLabelService) {

        let ctrl = this;

        ctrl.active = false;

        ctrl.presetLabels = presetLabelService.getLabels();

        ctrl.save = () => {
            let newPresetLabelList = ctrl.newLabel.split(',').map(e => e.trim());

            if (newPresetLabelList) {
                save(newPresetLabelList);
            }
        };

        ctrl.cancel = reset;

       ctrl.removePresetLabel = labelToRemove => {
            let updatedPresetLabelList = ctrl.presetLabels.filter( label => label !== labelToRemove);
            ctrl.presetLabels = updatedPresetLabelList;

            presetLabelService.setLabels(updatedPresetLabelList);
        };

        function save(label) {
            ctrl.adding = true;
            ctrl.active = false;

            let presetLabels = presetLabelService.getLabels();

            //currently only adds first label
            if (presetLabels.indexOf(label[0]) === -1) {
                let updatedPresetLabels = presetLabels.concat(label);

                presetLabelService.setLabels(updatedPresetLabels);
                ctrl.presetLabels = updatedPresetLabels;

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

presetLabels.directive('grPresetLabels', [function () {
    return {
        restrict: 'E',
        controller: 'GrPresetLabelsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
