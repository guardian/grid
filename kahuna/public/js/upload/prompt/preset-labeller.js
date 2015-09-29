import angular from 'angular';
import template from './preset-labeller.html!text';
import './preset-labeller.css!';

import '../../search/query-filter';
import '../../services/preset-label';

export var presetLabeller = angular.module('kahuna.upload.prompt.presetLabeller', [
    'kahuna.search.filters.query',
    'kahuna.services.presetLabel'
]);

presetLabeller.controller('PresetLabellerCtrl',
                  ['$rootScope', '$window', 'presetLabelService',
                   function($rootScope, $window, presetLabelService) {

   var ctrl = this;

   ctrl.presetLabels = presetLabelService.getLabels();

   $rootScope.$on('events:preset-labels:updated',
            () => ctrl.presetLabels = presetLabelService.getLabels());

   ctrl.removePresetLabel = labelToRemove => {
        let updatedPresetLabelList = ctrl.presetLabels.filter( label => label !== labelToRemove);
        ctrl.presetLabels = updatedPresetLabelList;

        presetLabelService.setLabels(updatedPresetLabelList);
    };

}]);

presetLabeller.directive('uiPresetLabeller', [function() {
    return {
        restrict: 'E',
        controller: 'PresetLabellerCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);


