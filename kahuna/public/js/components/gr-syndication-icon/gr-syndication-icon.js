import angular from 'angular';

import template from './gr-syndication-icon.html';
import './gr-syndication-icon.css';

import '../../image/service';

export var syndicationIcon = angular.module('gr.syndicationIcon', [
    'gr.image.service'
]);

syndicationIcon.controller('SyndicationIconCtrl', ['imageService', function (imageService) {
    const ctrl = this;

    ctrl.states = imageService(ctrl.image).states;
}]);

syndicationIcon.directive('grSyndicationIcon', [function () {
    return {
        restrict: 'E',
        template: template,
        scope: {
            image: '='
        },
        controller: 'SyndicationIconCtrl',
        controllerAs: 'ctrl',
        bindToController: true
    };
}]);
