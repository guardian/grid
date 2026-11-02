import angular from 'angular';
import template from './dnd-uploader.html';

import strings from '../strings.json';

export var dndUploader = angular.module('kahuna.upload.dndUploader', [
    'kahuna.upload.manager',
    'util.async'
]);


dndUploader.controller('DndUploaderCtrl',
                  ['$state', 'uploadManager',
                   function($state, uploadManager) {

    var ctrl = this;
    ctrl.uploadFiles = uploadFiles;

    function uploadFiles(files) {
        // Queue up files for upload and go to the upload state to
        // show progress
        uploadManager.upload(files).then(() => {
          $state.go('upload', {}, { reload: true });
        });
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
dndUploader.directive('dndUploader', ['$window', '$rootScope', 'delay', 'safeApply', 'vndMimeTypes',
                       function($window, $rootScope, delay, safeApply, vndMimeTypes) {

    return {
        restrict: 'E',
        controller: 'DndUploaderCtrl',
        controllerAs: 'dndUploader',
        template: template,
        scope: true,
        bindToController: true,
        link: (scope, element, attrs, ctrl) => {
            let dragging = false; // [1]
            ctrl.dropzoneExplanation = strings.dropzoneExplanation;
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

            const hasType = (types, key) => types.indexOf(key) !== -1;
            function hasGridMimetype(types) {
                const mimeTypes = Array.from(vndMimeTypes.values());
                return types.some(t => mimeTypes.indexOf(t) !== -1);
            }
            function isGridFriendly(e) {
                const types       = Array.from(e.dataTransfer.types);
                const hasFiles    = hasType(types, 'Files');
                const isGridImage = hasGridMimetype(types);

                const isFriendly = hasFiles && !isGridImage;

                return isFriendly;
            }

            function over(event) {
                dragging = isGridFriendly(event);
                // The dragover `preventDefault` is to allow for dropping
                event.preventDefault();
            }

            function enter(event) {
                if (isGridFriendly(event)) {
                    dragging = true;
                    activate();
                    $rootScope.$emit(
                      'track:event',
                      trackEvent,
                      'Drag',
                      'Enter',
                      null,
                      trackAction('Drag enter')
                    );
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
                const dataTransfer = event.dataTransfer;
                const files = Array.from(dataTransfer.files);

                event.preventDefault();

                if (isGridFriendly(event)) {
                    performDropAction(files);
                }
                scope.$apply(deactivate);
            }

            function performDropAction(files) {
                if (files.length > 0) {
                    ctrl.uploadFiles(files);
                    $rootScope.$emit(
                      'track:event',
                      trackEvent,
                      'Drop',
                      'Files',
                      null,
                      dropAction('Files')
                    );
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
