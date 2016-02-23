import angular from 'angular';
import template from './image-editor.html!text';

import './service';
import '../image/service';
import '../usage-rights/usage-rights-editor';
import '../components/gr-archiver-status/gr-archiver-status';
import {collectionsApi} from '../services/api/collections-api';


export var imageEditor = angular.module('kahuna.edits.imageEditor', [
    'kahuna.edits.service',
    'gr.image.service',
    'kahuna.edits.usageRightsEditor',
    'gr.archiverStatus',
    collectionsApi.name
]);

imageEditor.controller('ImageEditorCtrl', [
    '$rootScope',
    '$scope',
    '$timeout',
    'editsService',
    'editsApi',
    'imageService',
    'collections',

    function($rootScope,
             $scope,
             $timeout,
             editsService,
             editsApi,
             imageService,
             collections) {

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

    ctrl.collectionError = false;

    collections.getCollections().then(collections => {
        ctrl.collections = collections.data.children;
        // this will trigger the remember-scroll-top directive to return
        // users to their previous position on the collections panel
        // once the tree has been rendered
        $timeout(() => {
            $scope.$emit('gr:remember-scroll-top:apply');
        });
    }, () => {
        // TODO: More informative error handling
        // TODO: Stop error propagating to global error handler
        ctrl.error = true;
    }).catch(() => ctrl.collectionError = true);

    ctrl.selectionMode = true;

    ctrl.addToCollection = (collection) => {
        collections.addCollectionToImage(ctrl.image, collection);
        //this isn't needed when called from batch apply
        ctrl.addCollection = false;
    };

    ctrl.removeImageFromCollection = (collection) => {
        collections.removeImageFromCollection(collection, ctrl.image);
    };

    const batchApplyCollectionsEvent = 'events:batch-apply:collections';
    const batchRemoveCollectionsEvent = 'events:batch-remove:collections';

    ctrl.batchApplyCollections = () => {
        const collectionsOnImage = ctrl.image.data.collections.map(collection =>
                collection.data.path);

        if (collectionsOnImage.length > 0) {
            $rootScope.$broadcast(batchApplyCollectionsEvent, { collections: collectionsOnImage } );
        } else {
            ctrl.confirmDelete = true;

            $timeout(() => {
                ctrl.confirmDelete = false;
            }, 5000);
        }

        ctrl.batchRemoveCollections = () => {
            $rootScope.$broadcast(batchRemoveCollectionsEvent);
        };

    };

    if (Boolean(ctrl.withBatch)) {
        $scope.$on(batchApplyCollectionsEvent, (e, { collections }) => {
            collections.forEach( ctrl.addToCollection );
        });

        $scope.$on(batchRemoveCollectionsEvent, () => {
            const collectionsOnImage = ctrl.image.data.collections;
            collectionsOnImage.forEach( ctrl.removeImageFromCollection );
        })
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
