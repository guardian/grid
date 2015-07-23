import angular from 'angular';
import 'angular-bootstrap';

import './gr-panel.css!';
import '../../services/preview-selection';
import '../../services/label';
import '../../services/archive';
import '../../edits/service';
import '../../image/service';
import '../../forms/gr-xeditable/gr-xeditable';

export var grPanel = angular.module('grPanel', [
    'kahuna.services.selection',
    'kahuna.services.label',
    'kahuna.services.archive',
    'kahuna.edits.service',
    'gr.image.service',
    'grXeditable',
    'ui.bootstrap'
]);


grPanel.controller('grArchiverCtrl', function() {

    var ctrl = this;
    ctrl.count = 0;
    ctrl.notArchivedCount = 0;
    ctrl.archivedCount = 0;

    ctrl.service.count$.subscribe(i => ctrl.count = i);
    ctrl.service.archivedCount$.subscribe(i => ctrl.archivedCount = i);
    ctrl.service.notArchivedCount$.subscribe(i => ctrl.notArchivedCount = i);

    ctrl.add = ctrl.service.add;
    ctrl.remove = ctrl.service.remove;
});

grPanel.directive('grArchiver', function() {
    return {
        restrict: 'E',
        controller: 'grArchiverCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            service: '=grService'
        },
        template: `
            {{ctrl.count}}
            <button ng:click="ctrl.add()" ng:if="ctrl.notArchivedCount !== 0">
                <gr-icon>star</gr-icon>
                archive
            </button>
            <span ng;if="ctrl.notArchivedCount !== 0 && ctrl.archivedCount !== 0">/</span>
            <button ng:click="ctrl.remove()" ng:if="ctrl.archivedCount !== 0">
                unarchive
                <gr-icon>star_border</gr-icon>
            </button>
        `
    }
});

grPanel.controller('GrPanel', [
    '$scope',
    '$window',
    'mediaApi',
    'selectionService',
    'labelService',
    'archiveService',
    'editsService',
    'imagesService',
    'onValChange',
    function (
        $scope,
        $window,
        mediaApi,
        selection,
        labelService,
        archiveService,
        editsService,
        imagesService,
        onValChange) {

        var ctrl = this;


        ctrl.selectedImages = selection.selectedImages;
        ctrl.hasMultipleValues = (val) => Array.isArray(val);
        ctrl.clear = selection.clear;


        ctrl.archivedService = imagesService.archiveCollection(selection.images$);


        ctrl.credits = function(searchText) {
            return ctrl.metadataSearch('credit', searchText);
        };

        ctrl.metadataSearch = (field, q) => {
            return mediaApi.metadataSearch(field,  { q }).then(resource => {
                return resource.data.map(d => d.key);
            });
        };

        $scope.$watch(() => selection.getMetadata(), onValChange(newMetadata => {
            ctrl.rawMetadata = newMetadata;
            ctrl.metadata = selection.getDisplayMetadata();

            selection.canUserEdit().then(editable => {
                ctrl.userCanEdit = editable;
            });

            ctrl.selectedCosts = selection.getCost();

            ctrl.showCosts = ctrl.selectedCosts.length === 1 ?
                ctrl.selectedCosts[0].data !== 'free' :
                ctrl.selectedCosts.length > 1;

            ctrl.selectedLabels = selection.getLabels();

            ctrl.archivedCount = selection.getArchivedCount();

            switch (ctrl.archivedCount) {
                case 0: {
                    ctrl.archivedState = 'unarchived';
                    break;
                }
                case ctrl.selectedImages.size: {
                    ctrl.archivedState = 'archived';
                    break;
                }
                default: {
                    ctrl.archivedState = 'mixed';
                    break;
                }
            }
        }));

        ctrl.updateMetadataField = function (field, value) {
            var imageArray = Array.from(ctrl.selectedImages);
            return editsService.batchUpdateMetadataField(imageArray, field, value);
        };

        ctrl.addLabel = function (label) {
            var imageArray = Array.from(ctrl.selectedImages);
            labelService.batchAdd(imageArray, [label]);
        };

        ctrl.removeLabel = function (label) {
            var imageArray = Array.from(ctrl.selectedImages);
            labelService.batchRemove(imageArray, label);
        };

        ctrl.newLabel = function () {
            var label = ($window.prompt('Enter a label:') || '').trim();

            if (label) {
                ctrl.addLabel(label);
            }
        };

        ctrl.archive = () => {
            ctrl.archiving = true;
            var imageArray = Array.from(ctrl.selectedImages);
            archiveService.batchArchive(imageArray)
                .then(() => {
                    ctrl.archiving = false;
                });
        };

        ctrl.unarchive = () => {
            ctrl.archiving = true;
            var imageArray = Array.from(ctrl.selectedImages);
            archiveService.batchUnarchive(imageArray)
                .then(() => {
                    ctrl.archiving = false;
                });
        };
    }
]);
