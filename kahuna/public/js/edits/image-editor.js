import angular from 'angular';
import template from './image-editor.html!text';

export var imageEditor = angular.module('kahuna.edits.imageEditor', []);

imageEditor.controller('ImageEditorCtrl', ['$scope', '$q', 'poll', function($scope, $q, poll) {

    var pollFrequency = 500; // ms
    var pollTimeout   = 20 * 1000; // ms

    this.status = this.image.data.valid ? 'ready' : 'invalid';

    // watch the metadata for an update. when there is one, watch the api to check
    // when the message has been consumed and image re-indexed
    $scope.$watch(() => this.image.data.userMetadata.data.metadata, (newMetadata, oldMetadata) => {
        if (newMetadata !== oldMetadata) {

            this.status = 're-indexing';
            var metadataMatches = (image) => {
                var matches = Object.keys(newMetadata.data).every(key =>
                    newMetadata.data[key] === image.data.metadata[key]
                );
                return matches ? image : $q.reject('no match');
            };
            var apiSynced = () => this.image.get().then(metadataMatches);

            var whenIndexed = poll(apiSynced, pollFrequency, pollTimeout);
            whenIndexed.then(image => {
                this.status = image.data.valid ? 'ready' : 'invalid';
                this.image = image;
            });

        }
    });
}]);


imageEditor.directive('uiImageEditor', [function() {
    return {
        restrict: 'E',
        controller: 'ImageEditorCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template,
        scope: {
            image: '='
        }
    };
}]);
