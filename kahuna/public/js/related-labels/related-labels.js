import angular from 'angular';
import Rx from 'rx';

import template from './related-labels.html!text';
import './related-labels.css!';
import '../services/api/media-api';

export const relatedLabels = angular.module('gr.relatedLabels', []);

relatedLabels.controller('GrRelatedLabelsCtrl', ['mediaApi', function(mediaApi) {
    let ctrl = this;
    ctrl.relatedLabels = [];

    ctrl.suggestedLabelSearch = q =>
        mediaApi.
            labelsSuggest({q}).
            then(labels => {
                labels.follow('related-labels').get().then(related => {
                    ctrl.relatedLabels = related.data.map(label => {
                        return label.key.replace(`${ctrl.collection}/`, '');
                    });
                });
                return labels;
            }).
            then(labels => labels.data);


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
