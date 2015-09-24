import angular from 'angular';
import template from './image-editor.html!text';

import './service';
import '../image/service';
import '../usage-rights/usage-rights-editor';
import '../components/gr-image-persist-status/gr-image-persist-status';


export var imageEditor = angular.module('kahuna.edits.imageEditor', [
    'kahuna.edits.service',
    'gr.image.service',
    'kahuna.edits.usageRightsEditor',
    'gr.imagePersistStatus'
]);

imageEditor.controller('ImageEditorCtrl', [
    '$rootScope',
    '$scope',
    '$timeout',
    'editsService',
    'editsApi',
    'imageService',

    function($rootScope,
             $scope,
             $timeout,
             editsService,
             editsApi,
             imageService) {

    var ctrl = this;

    ctrl.status = ctrl.image.data.valid ? 'ready' : 'invalid';
    ctrl.saving = false;
    ctrl.saved = false;
    ctrl.error = false;

    const metadata = ctrl.image.data.userMetadata.data.metadata;
    const usageRights =  ctrl.image.data.userMetadata.data.usageRights;

    const offMetadataUpdateStart =
        editsService.on(metadata, 'update-start', () => ctrl.saving = true);

    const offMetadataUpdateEnd =
        editsService.on(metadata, 'update-end', onSave);

    const offMetadataUpdateError =
        editsService.on(metadata, 'update-error', onError);

    const offUsageRightsUpdateStart =
        editsService.on(usageRights, 'update-start', () => ctrl.saving = true);

    const offUsageRightsUpdateEnd =
        editsService.on(usageRights, 'update-end', onSave);

    const offUsageRightsUpdateError =
        editsService.on(usageRights, 'update-error', onError);

    $scope.$on('$destroy', () => {
        offMetadataUpdateStart();
        offMetadataUpdateEnd();
        offMetadataUpdateError();
        offUsageRightsUpdateStart();
        offUsageRightsUpdateEnd();
        offUsageRightsUpdateError();
    });

    function onSave() {
        return ctrl.image.get().then(newImage => {
            ctrl.image = newImage;
            ctrl.usageRights = imageService(ctrl.image).usageRights;
            updateUsageRightsCategory();
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
        ctrl.saving = false;
        ctrl.error = true;
    }


    ctrl.usageRights = imageService(ctrl.image).usageRights;

    function updateUsageRightsCategory() {
        let category = ctrl.categories.find(cat => cat.value === ctrl.usageRights.data.category);
        ctrl.usageRightsCategory = category && category.name;
        ctrl.showUsageRights = ctrl.usageRightsCategory === undefined;
    }

    editsApi.getUsageRightsCategories()
        .then(cats => ctrl.categories = cats)
        .finally(() => updateUsageRightsCategory());

    // TODO: Find a way to broadcast more selectively
    const batchApplyUsageRightsEvent = 'events:batch-apply:usage-rights';

    ctrl.batchApplyUsageRights = () =>
        $rootScope.$broadcast(batchApplyUsageRightsEvent, {
            data: ctrl.usageRights.data });

    if (Boolean(ctrl.withBatch)) {
        $scope.$on(batchApplyUsageRightsEvent, (e, { data }) => {
            const image = ctrl.image;
            const resource = image.data.userMetadata.data.usageRights;
            editsService.update(resource, data, image);
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
            image: '=',
            // FIXME: we only need these to pass them through to `required-metadata-editor`
            withBatch: '='
        }
    };
}]);
