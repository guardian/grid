import angular from 'angular';
import template from './results-editor.html!text';

export var resultsEditor = angular.module('kahuna.edits.resultsEditor', []);

resultsEditor.controller('ResultsEditorCtrl',
                         ['$q', 'mediaApi', 'editsApi', 'poll',
                          function($q, mediaApi, editsApi, poll) {
    var pollFrequency = 500; // ms
    var pollTimeout   = 20 * 1000; // ms

    var getValidState = image => image.data.valid ? 'ready' : 'invalid';
    var states = new Map;
    this.getStatus = result => states.get(result);

    mediaApi.search('', this.query).then(resource => {
        this.results = resource;
        this.results.data
            .forEach(result => states.set(result, getValidState(result)));
    });

    var offMetadataUpdate = editsApi.onMetadataUpdate(({ resource, metadata, id }) => {
        var edited = this.results.data.find(result => result.data.id === id);
        states.set(edited, 're-indexing');

        var metadataMatches = (result) => {
            var matches = Object.keys(resource.data).every(key =>
                resource.data[key] === result.data.metadata[key]
            );
            return matches ? result : $q.reject('no match');
        };

        var apiSynced = () => edited.get().then(metadataMatches);

        var whenIndexed = poll(apiSynced, pollFrequency, pollTimeout);
        whenIndexed.then(result => {
            states.delete(edited);
            states.set(result, getValidState(result));

            // FIXME: we have to change the value of the array for angular to
            // pick up on this change
            var i = this.results.data.indexOf(edited);
            this.results.data[i] = result;
        });

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
