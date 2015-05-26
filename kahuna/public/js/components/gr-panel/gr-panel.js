import angular from 'angular';

import './gr-panel.css!';
import '../../services/preview-selection';

export var grPanel = angular.module('grPanel', ['kahuna.services.selection']);

grPanel.controller('GrPanel', [
    '$scope',
    'selectionService',
    function (
        $scope,
        selection) {

        var ctrl = this;

        ctrl.selectedImages = selection.selectedImages;
        ctrl.multipleValues = (val) => Array.isArray(val);
        ctrl.clear = selection.clear;

        $scope.$watchCollection(() => selection.getMetadata(), (newMetadata, oldMetadata) => {
            if (!angular.equals(newMetadata, oldMetadata)) {
                ctrl.metadata = newMetadata;
            }
        });
    }
]);
