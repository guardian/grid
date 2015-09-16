import angular from 'angular';

import '../../services/label';
import '../../forms/datalist';

import './gr-add-label.css!';
import template from './gr-add-label.html!text';

import '../../directives/gr-auto-focus';

export var addLabel = angular.module('gr.addLabel', [
    'kahuna.services.label',
    'gr.autoFocus',
    'kahuna.forms.datalist'
]);

addLabel.controller('GrAddLabelCtrl', [
    '$window', 'labelService', 'mediaApi',
    function ($window, labelService,  mediaApi) {


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
                .then(images => {
                    ctrl.images = images;
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
        }

        ctrl.labelSearch = (q) => {
            return mediaApi.labelSearch({ q }).then(resource => {
                return resource.data.map(d => d.key);
            });
        };
    }
]);

addLabel.directive('grAddLabel', [function () {
    return {
        restrict: 'E',
        scope: {
            grSmall: '=?',
            active: '=',
            images: '='
        },
        controller: 'GrAddLabelCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
