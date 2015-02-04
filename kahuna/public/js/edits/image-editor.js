import angular from 'angular';
import template from './image-editor.html!text';

export var imageEditor = angular.module('kahuna.edits.imageEditor', []);

imageEditor.controller('ImageEditorCtrl', ['$scope', '$q', 'poll', function($scope, $q, poll) {

    var pollFrequency = 500; // ms
    var pollTimeout   = 20 * 1000; // ms

    this.status = this.image.data.valid ? 'ready' : 'invalid';
    this.saving = false;

    // Watch the metadata for an update from `required-metadata-editor`.
    // When the metadata is overridden, we don't know if the resulting
    // image is valid or not. This code checks when the update has
    // been processed and updates the status accordingly.
    $scope.$watch(() => this.image.data.userMetadata.data.metadata, (newMetadata, oldMetadata) => {
        if (newMetadata !== oldMetadata) {

            this.status = 're-indexing';
            this.saving = true;

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

                // FIXME: this is a bit of a hack to not trigger the watch again.
                image.data.userMetadata.data.metadata = this.image.data.userMetadata.data.metadata;
                this.image = image;
            }).finally(() => this.saving = false);

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
        transclude: true,
        scope: {
            image: '='
        }
    };
}]);
