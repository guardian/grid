import angular from 'angular';
import template from './labeler.html!text';


export var labeler = angular.module('kahuna.edits.labeler', []);

labeler.controller('LabelerCtrl',
                  ['$scope', '$window',
                   function($scope, $window) {

    function saveFailed() {
        $window.alert('Something went wrong when saving, please try again!');
    }

    this.addLabel = () => {
        // Prompt for a label and add if not empty
        var label = ($window.prompt("Enter a label:") || '').trim();
        if (label) {
            this.adding = true;
            $scope.labels.post({data: label}).
                then(newLabel => {
                    // FIXME: don't mutate original, replace the whole resource with the new state
                    $scope.labels.data.push(newLabel);
                }).
                catch(saveFailed).
                finally(() => {
                    this.adding = false;
                });
        }
    };

    this.labelsBeingRemoved = new Set;
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

labeler.directive('uiLabeler', [function() {
    return {
        restrict: 'E',
        scope: {
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            labels: '='
        },
        controller: 'LabelerCtrl as labeler',
        template: template
    };
}]);