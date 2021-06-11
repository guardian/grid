import angular from 'angular';

import './gr-preset-labels.css';
import template from './gr-preset-labels.html';

import '../../directives/gr-auto-focus';
import '../../services/preset-label';
import {mediaApi} from '../../services/api/media-api';

import strings from '../../strings.json';

export var presetLabels = angular.module('gr.presetLabels', [
    'gr.autoFocus',
    'kahuna.services.presetLabel',
    mediaApi.name
]);

presetLabels.controller('GrPresetLabelsCtrl', [
    '$window', 'presetLabelService', 'mediaApi',
    function ($window, presetLabelService, mediaApi) {

        let ctrl = this;

        ctrl.active = false;
        ctrl.exampleLabel = strings.exampleLabel;

        ctrl.presetLabels = presetLabelService.getLabels();

        ctrl.save = () => {
            const newPresetLabelList = ctrl.newLabel.split(',').map(e => e.trim());

            if (newPresetLabelList) {
                save(newPresetLabelList);
            }
        };

        ctrl.cancel = reset;

        ctrl.removePresetLabel = labelToRemove => {
            presetLabelService.removeLabel(labelToRemove);
            ctrl.presetLabels = presetLabelService.getLabels();
        };

        ctrl.suggestedLabelsSearch = q => mediaApi.labelsSuggest({q}).then(labels => labels.data);

        function save(labels) {
            ctrl.adding = true;
            ctrl.active = false;

            presetLabelService.addLabels(labels);
            ctrl.presetLabels = presetLabelService.getLabels();

            ctrl.adding = false;
            ctrl.newLabel = '';
        }

        function reset() {
            ctrl.active = false;
            ctrl.newLabel = '';
        }

    }
]);

presetLabels.directive('grPresetLabels', [function () {
    return {
        restrict: 'E',
        controller: 'GrPresetLabelsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template,
        scope: {}
    };
}]);
