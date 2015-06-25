import angular from 'angular';
import template from './labeller.html!text';
import templateCompact from './labeller-compact.html!text';

import '../search/query-filter';
import '../services/label';

export var labeller = angular.module('kahuna.edits.labeller', [
    'kahuna.search.filters.query',
    'kahuna.services.label'
]);

labeller.controller('LabellerCtrl',
                  ['$rootScope', '$scope', '$window', 'labelService',
                   function($rootScope, $scope, $window, labelService) {

    function saveFailed() {
        $window.alert('Something went wrong when saving, please try again!');
    }

    this.addLabel = () => {
        // Prompt for a label and add if not empty
        var label = ($window.prompt('Enter a label:') || '').trim();
        if (label) {
            this.addLabels([label]);
        }
    };

    this.addLabels = labels => {
        this.adding = true;

        labelService.add(this.image, labels)
            .catch(saveFailed)
            .finally(() => {
                this.adding = false;
            });
    };


    this.labelsBeingRemoved = new Set();
    this.removeLabel = label => {
        this.labelsBeingRemoved.add(label);

        labelService.remove(this.image, label)
            .catch(saveFailed)
            .finally(() => {
                this.labelsBeingRemoved.remove(label);
            });
    };

    const batchApplyLabelsEvent = 'events:batch-apply:labels';
    if (Boolean(this.withBatch)) {
        $scope.$on(batchApplyLabelsEvent, (e, labels) => this.addLabels(labels));

        this.batchApplyLabels = () => {
            const labels = this.image.data.userMetadata.data.labels;
            $rootScope.$broadcast(batchApplyLabelsEvent, labels.data.map(label => label.data));
        };
    }

}]);

labeller.directive('uiLabeller', [function() {
    return {
        restrict: 'E',
        scope: {
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            image: '=',
            withBatch: '=?'
        },
        controller: 'LabellerCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);

labeller.directive('uiLabellerCompact', [function() {
    return {
        restrict: 'E',
        scope: {
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            image: '=',
            disabled: '='
        },
        controller: 'LabellerCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: templateCompact
    };
}]);
