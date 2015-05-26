import angular from 'angular';

import './gr-panel.css!';
import '../../services/preview-selection';

export var grPanel = angular.module('grPanel', ['kahuna.services.selection']);

grPanel.controller('GrPanel', [
    '$scope',
    'selectionService',
    'onValChange',
    function (
        $scope,
        selection,
        onValChange) {

        var ctrl = this;

        ctrl.selectedImages = selection.selectedImages;
        ctrl.multipleValues = (val) => Array.isArray(val);
        ctrl.clear = selection.clear;

        $scope.$watch(() => selection.getMetadata(), onValChange(newMetadata => {
            ctrl.metadata = newMetadata;
        }));
    }
]);
