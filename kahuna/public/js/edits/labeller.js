import angular from 'angular';
import template from './labeller.html!text';

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
                    // FIXME: don't mutate original, replace the whole resource with the new state
                    newLabels.data.forEach(label => this.labels.data.push(label));
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
            then(() => {
                // FIXME: don't mutate original, replace the whole resource with the new state
                var labelIndex = this.labels.data.findIndex(l => l.data === label.data);
                this.labels.data.splice(labelIndex, 1);
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
            // TODO: Take a look at removing these template variables and use a
            // different directive / template bound to the same controller
            labels: '=',
            disableDelete:  '=',
            hidePlaceholder: '=',
            smallAddButton: '='
        },
        controller: 'LabellerCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template
    };
}]);
