import angular from 'angular';
import template from './image-editor.html!text';

import './service';
import './rights';

export var imageEditor = angular.module('kahuna.edits.imageEditor', [
    'kahuna.edits.rights',
    'kahuna.edits.service'
]);

imageEditor.controller('ImageEditorCtrl',
                       ['$scope', 'editsService',
                        function($scope, editsService) {

    var ctrl = this;

    ctrl.status = ctrl.image.data.valid ? 'ready' : 'invalid';

    const rights = ctrl.image.data.userMetadata.data.rights;
    const metadata = ctrl.image.data.userMetadata.data.metadata;

    const offRightsUpdateStart =
        editsService.on(rights, 'update-start', () => ctrl.saving = true);

    const offRightsUpdateEnd =
        editsService.on(rights, 'update-end', refreshImage);

    const offMetadataUpdateStart =
        editsService.on(metadata, 'update-start', () => ctrl.saving = true);

    const offMetadataUpdateEnd =
        editsService.on(metadata, 'update-end', refreshImage);

    $scope.$on('destroy', () => {
        offRightsUpdateStart();
        offRightsUpdateEnd();
        offMetadataUpdateStart();
        offMetadataUpdateEnd();
    });


    function refreshImage() {
        return ctrl.image.get().then(newImage => {
            ctrl.image = newImage;
            ctrl.status = ctrl.image.data.valid ? 'ready' : 'invalid';
            ctrl.saving = false;
        });
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
            image: '='
        }
    };
}]);
