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

    var ctrl = this;

    ctrl.status = ctrl.image.data.valid ? 'ready' : 'invalid';

    const rights = ctrl.image.data.userMetadata.data.rights;
    const metadata = ctrl.image.data.userMetadata.data.metadata;

    editsService.on(rights, 'update-start', () => ctrl.status = 'saving');
    editsService.on(rights, 'update-end', refreshImage);

    editsService.on(metadata, 'update-start', () => ctrl.status = 'saving')
    editsService.on(metadata, 'update-end', refreshImage);

    function refreshImage() {
        return ctrl.image.get().then(newImage => {
            ctrl.image = newImage;
            ctrl.status = ctrl.image.data.valid ? 'ready' : 'invalid';
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
