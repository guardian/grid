import angular from 'angular';
import template from './labeller.html!text';


export var labeller = angular.module('kahuna.edits.labeller', []);

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
            $scope.labels.post({data: [label]}).
                then(newLabels => {
                    // FIXME: don't mutate original, replace the whole resource with the new state
                    newLabels.data.forEach(label => $scope.labels.data.push(label));
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
                var labelIndex = $scope.labels.data.findIndex(l => l.data === label.data);
                $scope.labels.data.splice(labelIndex, 1);
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
            labels: '=',
            disableDelete:  '='
        },
        controller: 'LabellerCtrl as labeller',
        bindToController: true,
        template: template
    };
}]);
