import angular from 'angular';

export var dndUploader = angular.module('kahuna.upload.dndUploader', []);


dndUploader.controller('DndUploaderCtrl',
                  ['$state', 'uploadManager',
                   function($state, uploadManager) {

    var ctrl = this;
    ctrl.uploadFiles = uploadFiles;

    function uploadFiles(files) {
        // Queue up files for upload and go to the upload state to
        // show progress
        uploadManager.upload(files);
        $state.go('upload', {}, { reload: true });
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
dndUploader.directive('dndUploader', ['$window', 'jsDirectory', 'delay', 'safeApply',
                       function($window, jsDirectory, delay, safeApply) {
    return {
        restrict: 'E',
        controller: 'DndUploaderCtrl as dndUploader',
        templateUrl: jsDirectory + '/upload/dnd-uploader.html',
        link: (scope, element, attrs) => {
            var dragging = false; // [1]
            var $$window = angular.element($window);

            var activate   = () => safeApply(scope, () => scope.activated = true);
            var deactivate = () => safeApply(scope, () => scope.activated = false);

            // The dragover `preventDefault` is to allow for dropping
            $$window.on('dragover', event => {
                dragging = true;
                event.preventDefault()
            });
            $$window.on('dragenter', event => {
                dragging = true;
                activate();
            });
            $$window.on('dragleave', event => {
                dragging = false;
                delay(50).then(() => {
                    if (!dragging) {
                        deactivate();
                    }
                }); // [2]
            });
            $$window.on('drop', event => {
                var files = Array.from(event.originalEvent.dataTransfer.files);

                event.preventDefault();

                scope.dndUploader.uploadFiles(files);
                scope.$apply(deactivate);
            });
        }
    }
}]);
