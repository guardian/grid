import angular from 'angular';
import template from './preset-labeller.html!text';
import './preset-labeller.css!';

import '../../search/query-filter';

export var presetLabeller = angular.module('kahuna.upload.prompt.presetLabeller', [
    'kahuna.search.filters.query'
]);

presetLabeller.controller('PresetLabellerCtrl',
                  ['$rootScope', '$scope', '$window', '$timeout', 'onValChange',
                   function($rootScope, $scope, $window, $timeout, onValChange) {

   var ctrl = this;

   ctrl.presetLabels = JSON.parse($window.localStorage.getItem('preset labels'));

   ctrl.removePresetLabel = labelToRemove => {
        let updatedPresetLabelList = ctrl.presetLabels.filter( label => label !== labelToRemove);
        ctrl.presetLabels = updatedPresetLabelList;

        $window.localStorage.setItem('preset labels', JSON.stringify(updatedPresetLabelList));
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


