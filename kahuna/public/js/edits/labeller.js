import angular from 'angular';
import template from './labeller.html!text';
import templateCompact from './labeller-compact.html!text';

import '../search/query-filter';

export var labeller = angular.module('kahuna.edits.labeller', [
    'kahuna.search.filters.query'
]);

labeller.controller('LabellerCtrl',
                  ['$scope', '$window',
                   function($scope, $window) {

    function saveFailed() {
        $window.alert('Something went wrong when saving, please try again!');
    }

    this.addLabel = () => {
        // Prompt for a label and add if not empty
        var label = ($window.prompt('Enter a label:') || '').trim();
        if (label) {
            this.adding = true;
            this.labels.post({data: [label]}).
                then(newLabels => {
                    this.labels = newLabels;
                }).
                catch(saveFailed).
                finally(() => {
                    this.adding = false;
                });
        }
    };

    this.labelsBeingRemoved = new Set();
    this.removeLabel = (label) => {
        this.labelsBeingRemoved.add(label);

        label.delete().
            then(newLabels => {
                this.labels = newLabels;
            }).
            catch(saveFailed).
            finally(() => {
                this.labelsBeingRemoved.remove(label);
            });
    };

}]);

labeller.directive('uiLabeller', [function() {
    return {
        restrict: 'E',
        scope: {
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            labels: '='
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
            labels: '='
        },
        controller: 'LabellerCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: templateCompact
    };
}]);
