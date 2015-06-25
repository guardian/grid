import angular from 'angular';

import './gr-panel.css!';
import '../../services/preview-selection';
import '../../services/label';
import '../../edits/service';

export var grPanel = angular.module('grPanel', [
    'kahuna.services.selection',
    'kahuna.services.label',
    'kahuna.edits.service'
]);

grPanel.controller('GrPanel', [
    '$scope',
    '$window',
    'selectionService',
    'labelService',
    'editsService',
    'onValChange',
    function (
        $scope,
        $window,
        selection,
        labelService,
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

            ctrl.selectedCost = selection.getCost();

            ctrl.showCosts = ctrl.selectedCost.length === 1 ?
                ctrl.selectedCost[0].data !== 'free' :
                ctrl.selectedCost.length > 1;

            ctrl.selectedLabels = selection.getLabels();
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
    }
]);
