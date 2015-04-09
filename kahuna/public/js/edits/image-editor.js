import angular from 'angular';
import template from './image-editor.html!text';

import './service';
import './rights';

export var imageEditor = angular.module('kahuna.edits.imageEditor', [
    'kahuna.edits.rights',
    'kahuna.edits.service'
]);

imageEditor.controller('ImageEditorCtrl',
                       ['$scope', '$q', 'poll', 'editsService',
                        function($scope, $q, poll, editsService) {

    var pollFrequency = 500; // ms
    var pollTimeout   = 20 * 1000; // ms

    this.status = this.image.data.valid ? 'ready' : 'invalid';
    this.saving = false;

    editsService.on(
        this.image.data.userMetadata.data.rights,
        'update-start',
        () => {
            this.status = 'saving';
            this.saving = true;
        }
    );

    editsService.on(
        this.image.data.userMetadata.data.rights,
        'update-end',
        () => {
            this.image.get().then(newImage => {
                this.image = newImage;
                this.status = this.image.data.valid ? 'ready' : 'invalid';
            });
        }
    );

    // Watch the metadata for an update from `required-metadata-editor`.
    // When the metadata is overridden, we don't know if the resulting
    // image is valid or not. This code checks when the update has
    // been processed and updates the status accordingly.
    // TODO: Move this over to use the new `edits-service`
    //$scope.$watch(() => this.image.data.userMetadata.data.metadata, (newMetadata, oldMetadata) => {
    //    if (newMetadata !== oldMetadata) {
    //
    //        this.status = 'saving';
    //        this.saving = true;
    //
    //        var metadataMatches = (image) => {
    //            // FIXME: Hack for a modelling problem in edits. Keywords shouldn't
    //            // be sent across, but they are as the `ImageMetadata.Writes` converts nothing
    //            // into `Nil`.
    //            var matches = Object.keys(newMetadata.data).every(key =>
    //                angular.equals(newMetadata.data[key], image.data.metadata[key])
    //            );
    //
    //            return matches ? image : $q.reject('no match');
    //        };
    //        var apiSynced = () => this.image.get().then(metadataMatches);
    //
    //        var whenIndexed = poll(apiSynced, pollFrequency, pollTimeout);
    //        whenIndexed.then(image => {
    //            this.status = image.data.valid ? 'ready' : 'invalid';
    //
    //            // FIXME: this is a bit of a hack to not trigger the watch again.
    //            image.data.userMetadata.data.metadata = this.image.data.userMetadata.data.metadata;
    //            this.image = image;
    //        }).finally(() => this.saving = false);
    //
    //    }
    //});
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
