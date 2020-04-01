import angular from 'angular';

import '../../services/label';
import '../../forms/datalist';

import './gr-add-label.css';
import template from './gr-add-label.html';

import '../../directives/gr-auto-focus';

export var addLabel = angular.module('gr.addLabel', [
    'kahuna.services.label',
    'gr.autoFocus',
    'kahuna.forms.datalist'
]);

addLabel.controller('GrAddLabelCtrl', [
    '$window', '$q', 'labelService', 'mediaApi',
    function ($window, $q, labelService,  mediaApi) {

        let ctrl = this;

        ctrl.active = false;

        ctrl.save = () => {
            let labelList = ctrl.newLabel.split(',').map(e => e.trim());
            let imageArray = Array.from(ctrl.images);

            if (labelList) {
                save(labelList, imageArray);
            }
        };

        ctrl.cancel = reset;

        function save(label, imageArray) {
            ctrl.adding = true;
            ctrl.active = false;

            labelService.batchAdd(imageArray, label)
                .then(() => {
                    reset();
                })
                .catch(saveFailed)
                .finally(() => ctrl.adding = false);

        }

        function saveFailed(e) {
          console.error(e);
            $window.alert('Something went wrong when saving, please try again!');
            ctrl.active = true;
        }

        function reset() {
            ctrl.newLabel = '';
            ctrl.active = false;
        }

        ctrl.labelSearch = (q) => {
            if (! q) {
                return $q.resolve([]);
            } else {
                return mediaApi.labelSearch({q}).then(resource => {
                    return resource.data.map(d => d.key);
                });
            }
        };

        ctrl.labelAppend = (currentVal, selectedVal) => {
            const beforeLastComma = currentVal.split(/, ?/).slice(0, -1);
            const fullText = beforeLastComma.concat(selectedVal);
            return fullText.join(', ');
        };

        ctrl.selectLastLabel = (value) => {
            const afterComma = value.split(',').slice(-1)[0].trim();
            return afterComma;
        };

    }
]);

addLabel.directive('grAddLabel', [function () {
    return {
        restrict: 'E',
        scope: {
            grSmall: '=?',
            active: '=?',
            images: '='
        },
        controller: 'GrAddLabelCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
