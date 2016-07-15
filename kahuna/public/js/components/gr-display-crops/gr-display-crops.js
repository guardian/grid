import angular from 'angular';
import template from './gr-display-crops.html!text';

export var displayCrops = angular.module('gr.displayCrops', []);

displayCrops.controller('GrDisplayCrops', [function() {

    let ctrl = this;

    ctrl.showCrops = false;
}]);

displayCrops.directive('grDisplayCrops', [function () {
    return {
        restrict: 'E',
        scope: {
            crops: '='
        },
        controller: 'GrDisplayCrops',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
