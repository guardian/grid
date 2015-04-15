import angular from 'angular';
import template from './image-editor.html!text';

import './service';
import './rights';

export var imageEditor = angular.module('kahuna.edits.imageEditor', [
    'kahuna.edits.rights',
    'kahuna.edits.service'
]);

imageEditor.controller('ImageEditorCtrl',
                       ['$scope', '$timeout', 'editsService',
                        function($scope, $timeout, editsService) {

    var ctrl = this;

    ctrl.status = ctrl.image.data.valid ? 'ready' : 'invalid';
    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.error = false;

    const rights = ctrl.image.data.userMetadata.data.rights;
    const metadata = ctrl.image.data.userMetadata.data.metadata;

    const offRightsUpdateStart =
        editsService.on(rights, 'update-start', () => ctrl.saving = true);

    const offRightsUpdateEnd =
        editsService.on(rights, 'update-end', onSave);

    const offRightsUpdateError =
        editsService.on(rights, 'update-error', onError);

    const offMetadataUpdateStart =
        editsService.on(metadata, 'update-start', () => ctrl.saving = true);

    const offMetadataUpdateEnd =
        editsService.on(metadata, 'update-end', onSave);

    const offMetadataUpdateError =
        editsService.on(metadata, 'update-error', onError);

    $scope.$on('$destroy', () => {
        offRightsUpdateStart();
        offRightsUpdateEnd();
        offRightsUpdateError();

        offMetadataUpdateStart();
        offMetadataUpdateEnd();
        offMetadataUpdateError();
    });


    function onSave() {
        return ctrl.image.get().then(newImage => {
            ctrl.image = newImage;
            ctrl.status = ctrl.image.data.valid ? 'ready' : 'invalid';
            ctrl.saving = false;

            ctrl.error = false;
            ctrl.saved = true;
            $timeout(() => ctrl.saved = false, 1000);
        }).
        // TODO: we could retry here again, but re-saving does that, and given
        // it's auto-save, it should be fine.
        then(() => onError);
    }

    function onError() {
        ctrl.error = true;
    }

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
            image: '=',
            // FIXME: we only need these to pass them through to `required-metadata-editor`
            withBatch: '='
        }
    };
}]);
