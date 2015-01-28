import angular from 'angular';
import template from './results-editor.html!text';

export var resultsEditor = angular.module('kahuna.edits.resultsEditor', []);

resultsEditor.controller('ResultsEditorCtrl', [function() {

}]);


resultsEditor.directive('uiResultsEditor', [function() {
    return {
        restrict: 'E',
        controller: 'ResultsEditorCtrl',
        controllerAs: 'resultsEditor',
        bindToController: true,
        scope: {
            results: '='
        },
        template: template
    };
}]);
