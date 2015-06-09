import angular from 'angular';

import './gr-panel.css!';
import '../../services/preview-selection';
import '../../edits/service';

export var grPanel = angular.module('grPanel', ['kahuna.services.selection', 'kahuna.edits.service']);

grPanel.controller('GrPanel', [
    '$scope',
    'selectionService',
    'editsService',
    'onValChange',
    function (
        $scope,
        selection,
        editsService,
        onValChange) {

        var ctrl = this;

        ctrl.selectedImages = selection.selectedImages;
        ctrl.hasMultipleValues = (val) => Array.isArray(val);
        ctrl.clear = selection.clear;

        $scope.$watch(() => selection.getMetadata(), onValChange(newMetadata => {
            ctrl.rawMetadata = newMetadata;
            ctrl.metadata = selection.getDisplayMetadata();

            selection.canUserEdit().then(editable => {
                ctrl.userCanEdit = editable;
            });
        }));

        ctrl.updateMetadata = function (field, value) {
            return editsService.batchUpdateMetadata(ctrl.selectedImages, field, value);
        }
    }
]);
