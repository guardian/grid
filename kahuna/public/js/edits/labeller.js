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

    var ctrl = this;
    ctrl.labels = ctrl.image.data.userMetadata.data.labels;

    function saveFailed() {
        $window.alert('Something went wrong when saving, please try again!');
    }

    ctrl.addLabel = () => {
        // Prompt for a label and add if not empty
        var label = ($window.prompt('Enter a label:') || '').trim();
        if (label) {
            ctrl.addLabels([label]);
        }
    };

    ctrl.addLabels = labels => {
        ctrl.adding = true;

        labelService.add(ctrl.image, labels)
            .then(img => {
                ctrl.image = img;
                ctrl.labels = ctrl.image.data.userMetadata.data.labels;
            })
            .catch(saveFailed)
            .finally(() => {
                ctrl.adding = false;
            });
    };


    ctrl.labelsBeingRemoved = new Set();
    ctrl.removeLabel = label => {
        ctrl.labelsBeingRemoved.add(label);

        labelService.remove(ctrl.image, label)
            .then(img => {
                ctrl.image = img;
                ctrl.labels = ctrl.image.data.userMetadata.data.labels;
            })
            .catch(saveFailed)
            .finally(() => {
                ctrl.labelsBeingRemoved.remove(label);
            });
    };

    const batchApplyLabelsEvent = 'events:batch-apply:labels';
    if (Boolean(ctrl.withBatch)) {
        $scope.$on(batchApplyLabelsEvent, (e, labels) => ctrl.addLabels(labels));

        ctrl.batchApplyLabels = () => {
            $rootScope.$broadcast(batchApplyLabelsEvent, ctrl.labels.data.map(label => label.data));
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
