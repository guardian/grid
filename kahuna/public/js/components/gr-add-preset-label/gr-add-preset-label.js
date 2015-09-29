import angular from 'angular';

import '../../forms/datalist';

import './gr-add-preset-label.css!';
import template from './gr-add-preset-label.html!text';

import '../../directives/gr-auto-focus';

export var addPresetLabel = angular.module('gr.addPresetLabel', [
    'gr.autoFocus',
    'kahuna.forms.datalist'
]);

addPresetLabel.controller('GrAddPresetLabelCtrl', [
    '$window', '$q', 'labelService', 'mediaApi',
    function ($window, $q, labelService,  mediaApi) {


        let ctrl = this;

        ctrl.active = false;

        ctrl.save = () => {
            let presetLabelList = ctrl.newLabel.split(',').map(e => e.trim());

            if (presetLabelList) {
                save(presetLabelList);
            }
        };

        ctrl.cancel = reset;

        function save(label) {
            ctrl.adding = true;
            ctrl.active = false;

            let presetLabels = JSON.parse($window.localStorage.getItem('preset labels'));

            //currently only adds first label
            if (presetLabels.indexOf(label[0]) === -1) {
                let updatedPresetLabels = presetLabels.concat(label);
                ctrl.

                $window.localStorage.setItem('preset labels', JSON.stringify(updatedPresetLabels));
                reset();
            }

            ctrl.adding = false;

        }

        function saveFailed() {
            $window.alert('Something went wrong when saving, please try again!');
            ctrl.active = true;
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
