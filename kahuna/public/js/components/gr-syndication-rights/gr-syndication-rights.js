import angular from 'angular';

import template from './gr-syndication-rights.html';

import '../../image/service';
import '../../services/image-accessor';

export const syndicationRights = angular.module('gr.syndicationRights', [
    'gr.image.service',
    'kahuna.services.image-accessor'
]);

syndicationRights.controller('GrSyndicationRightsCtrl', [
    '$rootScope',
    '$scope',
    'imageService',

    function($rootScope, $scope, imageService) {
        const ctrl = this;

        const states = imageService(ctrl.image).states;

        ctrl.hasInformationFromRCS = states.hasSyndicationRights;
        ctrl.hasRightsAcquired = states.hasRightsAcquiredForSyndication;
    }
]);

syndicationRights.directive('grSyndicationRights', [function() {
    return {
        restrict: 'E',
        scope: {
            image: '='
        },
        controller: 'GrSyndicationRightsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template
    };
}]);
