import angular from 'angular';
import template from './gr-display-crops.html';
import './gr-display-crops.css';

import {cropUtil} from '../../util/crop';

export const displayCrops = angular.module('gr.displayCrops', [cropUtil.name]);

displayCrops.controller('GrDisplayCrops', [function() {

    let ctrl = this;

    ctrl.showCrops = false;

    ctrl.canDownloadCrop = window._clientConfig.canDownloadCrop;
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
