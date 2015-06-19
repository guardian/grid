import angular from 'angular';
import template from './dnd-uploader.html!text';

import '../services/api/witness';

export var dndUploader = angular.module('kahuna.upload.dndUploader', [
    'kahuna.witness'
]);


dndUploader.controller('DndUploaderCtrl',
                  ['$state', 'uploadManager', 'loaderApi', 'editsService',
                   'apiPoll', 'witnessApi',
                   function($state, uploadManager, loaderApi, editsService,
                            apiPoll, witnessApi) {

    var ctrl = this;
    ctrl.uploadFiles = uploadFiles;
    ctrl.importWitnessImage = importWitnessImage;
    ctrl.isWitnessUri = witnessApi.isWitnessUri;

    function uploadFiles(files) {
        // Queue up files for upload and go to the upload state to
        // show progress
        uploadManager.upload(files);
        $state.go('upload', {}, { reload: true });
    }

    function importWitnessImage(uri) {
        const witnessReportId = witnessApi.extractReportId(uri);
        if (witnessReportId) {
            witnessApi.getReport(witnessReportId).then(({fileUri, metadata, identifiers}) => {
                loaderApi.import(fileUri, identifiers).then(mediaResp => {
                    // Wait until image indexed
                    return apiPoll(() => mediaResp.get());
                }).then(fullImage => {
                    // Override with Witness metadata
                    const userMetadata = fullImage.data.userMetadata.data.metadata;
                    const metadataUpdate = editsService.
                        update(userMetadata, metadata, fullImage);

                    const rights = {
                        category: 'guardian-witness',
                        // FIXME: can we avoid hardcoding?
                        restrictions: 'Contact the GuardianWitness desk before use!'
                    };
                    const userRights = fullImage.data.userMetadata.data.usageRights;
                    const rightsUpdate = editsService.
                        update(userRights, rights, fullImage);

                    return Promise.all([metadataUpdate, rightsUpdate]).
                        then(() => fullImage.data.id);
                }).then(imageId => {
                    // Go to image preview page
                    $state.go('image', {imageId});
                });
            });
        } else {
            // Should not get to here
            alert('Failed to identify the Witness contribution, please try again');
        }
    }
}]);

/**
 * we using the dragging bool[1] as the dragleave event is fired
 * when you hover over child elements within a drag zone.
 * This way we allow for a small interval and a check on this bool[2] to
 * establish whether we have *really* stopped dragging. I am assuming this is how
 * it is done on Gmail / Dropbox as you can observe a small delay on their
 * `dragover` UI disappearing. What a drag.
 *
 * This behaviour is pretty well observed:
 * https://code.google.com/p/chromium/issues/detail?id=131325
 */
dndUploader.directive('dndUploader', ['$window', 'delay', 'safeApply',
                       function($window, delay, safeApply) {
    return {
        restrict: 'E',
        controller: 'DndUploaderCtrl as dndUploader',
        template: template,
        link: (scope) => {
            var dragging = false; // [1]
            var $$window = angular.element($window);

            var activate   = () => safeApply(scope, () => scope.activated = true);
            var deactivate = () => safeApply(scope, () => scope.activated = false);

            $$window.on('dragover', over);
            $$window.on('dragenter', enter);
            $$window.on('dragleave', leave);
            $$window.on('drop', drop);

            scope.$on('$destroy', clean);

            function over(event) {
                dragging = true;
                // The dragover `preventDefault` is to allow for dropping
                event.preventDefault();
            }

            function enter(event) {
                dragging = true;
                activate();
            }

            function leave() {
                dragging = false;
                delay(50).then(() => {
                    if (!dragging) {
                        deactivate();
                    }
                }); // [2]
            }

            function drop(event) {
                const dataTransfer = event.originalEvent.dataTransfer;
                const files = Array.from(dataTransfer.files);
                const uri = dataTransfer.getData('text/uri-list');

                event.preventDefault();

                if (files.length > 0) {
                    scope.dndUploader.uploadFiles(files);
                } else if (scope.dndUploader.isWitnessUri(uri)) {
                    scope.dndUploader.importWitnessImage(uri);
                } else {
                    alert('You must drop valid files or Guardian Witness URLs to upload them');
                }
                scope.$apply(deactivate);
            }

            function clean() {
                $$window.off('dragover', over);
                $$window.off('dragenter', enter);
                $$window.off('dragleave', leave);
                $$window.off('drop', drop);
            }
        }
    };
}]);
