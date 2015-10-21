import angular from 'angular';
import * as querySyntax from '../search-query/query-syntax';

import template from './related-labels.html!text';
import './related-labels.css!';

import '../services/api/media-api';

export const relatedLabels = angular.module('gr.relatedLabels', []);

relatedLabels.controller('GrRelatedLabelsCtrl', [
    '$state',
    '$stateParams',
    'mediaApi',

function($state, $stateParams, mediaApi) {

    let ctrl = this;
    ctrl.relatedLabels = [];

    ctrl.suggestedLabelSearch = q =>
        mediaApi.
            labelsSuggest({q}).
            then(labels => {
                labels.follow('related-labels').get().then(related => {
                    ctrl.relatedLabels = related.data.map(label => {
                        // TODO: return a model that does this for us from the API
                        return label.key.replace(`${ctrl.collection}/`, '');
                    });
                });
                // return this to the search query
                return labels.data;
            });

    // TODO: Move to query service.
    ctrl.switchCollection = labelPostfix => {
        // TODO: return a model that does this for us from the API
        const label = `${ctrl.collection}/${labelPostfix}`;
        const q = $stateParams.query || '';
        const removedLabelsQ = querySyntax.removeLabels(q, ctrl.relatedLabels);
        const query = querySyntax.addLabel(removedLabelsQ, label);
        setQuery(query);
    };

    ctrl.removeCollection = labelPostfix => {
        // TODO: return a model that does this for us from the API
        const label = `${ctrl.collection}/${labelPostfix}`;
        const query = querySyntax.removeLabel($stateParams.query || '', label);
        setQuery(query);
    };

    function setQuery(query) {
        const newStateParams = angular.extend({}, $stateParams, { query });
        $state.transitionTo($state.current, newStateParams, {
            reload: true, inherit: false, notify: true
        });
    }
}]);

relatedLabels.directive('grRelatedLabels', [function() {
    return {
        restrict: 'E',
        controller: 'GrRelatedLabelsCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
