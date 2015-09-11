import angular from 'angular';

import '../../services/label';

import './gr-add-label.css!';
import template from './gr-add-label.html!text';

import '../../directives/gr-auto-focus';

export var addLabel = angular.module('gr.addLabel', [
    'kahuna.services.label',
    'gr.autoFocus'
]);

addLabel.controller('GrAddLabelCtrl', [
    '$window', 'labelService',
    function ($window, labelService) {

        let ctrl = this;

        ctrl.active = false;

        ctrl.save = () => {
            let labelList = ctrl.newLabel.split(',').map(e => e.trim());
            let imageArray = ctrl.selected ? Array.from(ctrl.selected) : [ctrl.image];

            if (labelList) {
                save(labelList, imageArray);
            }
        };

        ctrl.cancel = reset;

        function save(label, imageArray) {
            ctrl.adding = true;

            labelService.batchAdd(imageArray, label)
                .then(image => {
                    ctrl.image = image;
                    reset();
                })
                .catch(saveFailed)
                .finally(() => ctrl.adding = false);

        }

        function saveFailed() {
            $window.alert('Something went wrong when saving, please try again!');
        }

        function reset() {
            ctrl.newLabel = '';
            ctrl.active = false;
        }
    }
]);

addLabel.directive('grAddLabel', [function () {
    return {
        restrict: 'E',
        scope: {
            image: '=',
            grSmall: '=?',
            active: '=',
            selected: '='
        },
        controller: 'GrAddLabelCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
