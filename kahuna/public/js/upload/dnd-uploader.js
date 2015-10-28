import angular from 'angular';
import template from './dnd-uploader.html!text';

import '../services/api/witness';
import '../analytics/track';

export var dndUploader = angular.module('kahuna.upload.dndUploader', [
    'kahuna.upload.manager',
    'kahuna.services.api',
    'kahuna.edits.service',
    'kahuna.witness',
    'util.async',
    'analytics.track'
]);


dndUploader.controller('DndUploaderCtrl',
                  ['$state', '$window', '$q', 'uploadManager', 'loaderApi', 'editsService',
                   'apiPoll', 'witnessApi',
                   function($state, $window, $q, uploadManager, loaderApi, editsService,
                            apiPoll, witnessApi) {

    var ctrl = this;
    //hack to prevent grid thumbnails being re-added to the grid for now
    //TODO make generic - have API tell kahuna S3 buckets' domain
    const gridThumbnailPattern = /https:\/\/media-service([0-9-a-z]+)thumbbucket([0-9-a-z]+)/;

    ctrl.uploadFiles = uploadFiles;
    ctrl.importWitnessImage = importWitnessImage;
    ctrl.isWitnessUri = witnessApi.isWitnessUri;
    ctrl.isNotGridThumbnail = (uri)  => !gridThumbnailPattern.test(uri);
    ctrl.loadUriImage = loadUriImage;

    function uploadFiles(files) {
        // Queue up files for upload and go to the upload state to
        // show progress
        uploadManager.upload(files);
        $state.go('upload', {}, { reload: true });
    }


    function loadAndUpdateWitnessImage(fileUri, metadata, identifiers) {
        return loaderApi.import(fileUri, identifiers).then(mediaResp => {
            // Wait until image indexed
            return apiPoll(() => mediaResp.get());
        }).then(fullImage => {
            // Override with Witness metadata
            const userMetadata = fullImage.data.userMetadata.data.metadata;
            const metadataUpdate = editsService.
                      update(userMetadata, metadata, fullImage);

            const rights = {
                category: 'guardian-witness'
            };
            const userRights = fullImage.data.userMetadata.data.usageRights;
            const rightsUpdate = editsService.
                      update(userRights, rights, fullImage);

            return Promise.all([metadataUpdate, rightsUpdate]).
                then(() => fullImage.data.id);
        });
    }

   function loadUriImage(fileUri) {
        uploadManager.uploadUri(fileUri);
        $state.go('upload', {}, { reload: true });
    }

    function importWitnessImage(uri) {
        const witnessReportId = witnessApi.extractReportId(uri);
        if (witnessReportId) {
            return witnessApi.getReport(witnessReportId).
                then(({fileUri, metadata, identifiers}) => {
                    return loadAndUpdateWitnessImage(fileUri, metadata, identifiers);
                }).then(imageId => {
                    // Go to image preview page
                    $state.go('image', {imageId});
                }).catch(() => {
                    $window.alert('An error occurred while importing the ' +
                                  'Witness contribution, please try again');
                });
        } else {
            // Should not get to here
            $window.alert('Failed to identify the Witness contribution, please try again');
            return $q.reject();
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
dndUploader.directive('dndUploader', ['$window', 'delay', 'safeApply', 'track',
                       function($window, delay, safeApply, track) {

    const gridImageMimeType = 'application/vnd.mediaservice.image+json';

    return {
        restrict: 'E',
        controller: 'DndUploaderCtrl',
        controllerAs: 'dndUploader',
        template: template,
        scope: true,
        bindToController: true,
        link: (scope, element, attrs, ctrl) => {
            let dragging = false; // [1]
            const $$window = angular.element($window);

            const activate    = () => safeApply(scope, () => ctrl.activated = true);
            const deactivate  = () => safeApply(scope, () => ctrl.activated = false);
            const trackEvent  = 'Upload action';
            const trackAction = actionName => ({ 'Action': actionName });
            const dropAction  = content =>
                angular.extend({}, trackAction('Drop'), { 'Content': content });

            $$window.on('dragover', over);
            $$window.on('dragenter', enter);
            $$window.on('dragleave', leave);
            $$window.on('drop', drop);

            scope.$on('$destroy', clean);

            function isDraggingFromGrid(event) {
                const dataTransfer = event.originalEvent.dataTransfer;
                // Convert as FF uses DOMStringList and Chrome an Array
                const types = Array.from(dataTransfer.types);
                return types.indexOf(gridImageMimeType) !== -1;
            }

            function over(event) {
                dragging = ! isDraggingFromGrid(event);
                // The dragover `preventDefault` is to allow for dropping
                event.preventDefault();
            }

            function enter(event) {
                if (! isDraggingFromGrid(event)) {
                    dragging = true;
                    activate();
                    track.action(trackEvent, trackAction('Drag enter'));
                }
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

                if (! isDraggingFromGrid(event)) {
                    performDropAction(files, uri);
                }
                scope.$apply(deactivate);
            }

            function performDropAction(files, uri) {
                if (files.length > 0) {
                    ctrl.uploadFiles(files);
                    track.action(trackEvent, dropAction('Files'));
                } else if (ctrl.isWitnessUri(uri)) {
                    ctrl.importing = true;
                    ctrl.importWitnessImage(uri).finally(() => {
                        ctrl.importing = false;
                    });
                    track.action(trackEvent, dropAction('Witness'));
                } else if (ctrl.isNotGridThumbnail(uri)) {
                    ctrl.loadUriImage(uri);
                }
                else {
                    $window.alert('You must drop valid files or ' +
                        'URLs to upload them');

                    track.action(trackEvent, dropAction('Invalid'));
                }
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
