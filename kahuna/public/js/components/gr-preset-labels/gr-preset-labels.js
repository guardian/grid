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
            let updatedPresetList = ctrl.presetLabels.filter( label => label !== labelToRemove);
            ctrl.presetLabels = updatedPresetList;

            presetLabelService.setLabels(updatedPresetList);
        };

        function save(labels) {
            ctrl.adding = true;
            ctrl.active = false;

            let presetLabels = presetLabelService.getLabels();

            let newLabels = labels.filter( label => presetLabels.indexOf(label) === -1);

            let updatedPresetLabels = presetLabels.concat(newLabels);

            presetLabelService.setLabels(updatedPresetLabels);
            ctrl.presetLabels = presetLabelService.getLabels();

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
