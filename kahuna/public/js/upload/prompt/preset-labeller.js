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
                  ['$rootScope', '$scope', '$window', '$timeout', 'onValChange', 'presetLabelService',
                   function($rootScope, $scope, $window, $timeout, onValChange, presetLabelService) {

   var ctrl = this;

   ctrl.presetLabels = presetLabelService.get();

   ctrl.removePresetLabel = labelToRemove => {
        let updatedPresetLabelList = ctrl.presetLabels.filter( label => label !== labelToRemove);
        ctrl.presetLabels = updatedPresetLabelList;

        presetLabelService.set(updatedPresetLabelList);
    }

    function saveFailed() {
        $window.alert('Something went wrong when saving, please try again!');
    }


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


