import angular from 'angular';
import '../services/api/media-api';

import template from './related-labels.html!text';

export const relatedLabels = angular.module('gr.relatedLabels', []);

relatedLabels.controller('GrRelatedLabelsCtrl', ['mediaApi', function(mediaApi) {
    let ctrl = this;

    ctrl.suggestedLabelSearch = q =>
        mediaApi.labelsSuggest({q}).then(labels => labels.data);

    
}]);

relatedLabels.directive('grRelatedLabels', [function() {
    return {
        restrict: 'E',
        controller: 'GrRelatedLabelsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    }
}]);
