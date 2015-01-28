import angular from 'angular';
import template from './results-editor.html!text';

export var resultsEditor = angular.module('kahuna.edits.resultsEditor', []);

resultsEditor.controller('ResultsEditorCtrl',
                         ['mediaApi', 'editsApi',
                          function(mediaApi) {
    mediaApi.search('', this.query).then(resource => {
        this.results = resource;
    });
}]);


resultsEditor.directive('uiResultsEditor', [function() {
    return {
        restrict: 'E',
        controller: 'ResultsEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            query: '='
        },
        template: template
    };
}]);
