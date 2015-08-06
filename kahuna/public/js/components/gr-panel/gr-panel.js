import angular from 'angular';
import 'angular-bootstrap';

import './gr-panel.css!';
import '../../services/preview-selection';
import '../../services/label';
import '../../services/panel';
import '../../edits/service';
import '../../archiver/service';
import '../../archiver/archiver';
import '../../forms/gr-xeditable/gr-xeditable';

export var grPanel = angular.module('grPanel', [
    'kahuna.services.selection',
    'kahuna.services.label',
    'kahuna.services.panel',
    'kahuna.edits.service',
    'gr.archiver.service',
    'gr.archiver',
    'grXeditable',
    'ui.bootstrap'
]);

grPanel.controller('GrPanel', [
    '$rootScope',
    '$scope',
    '$window',
    '$q',
    'mediaApi',
    'selectionService',
    'labelService',
    'panelService',
    'editsService',
    'editsApi',
    'archiverService',
    'onValChange',
    function (
        $rootScope,
        $scope,
        $window,
        $q,
        mediaApi,
        selection,
        labelService,
        panelService,
        editsService,
        editsApi,
        archiverService,
        onValChange) {

        var ctrl = this;

        const panelName = 'gr-panel';

        panelService.addPanel(panelName, false);
        ctrl.isVisible = panelService.isVisible(panelName);

        $rootScope.$on(
            'ui:panels:gr-panel:updated',
            () => ctrl.isVisible = panelService.isVisible(panelName)
        );
        ctrl.metadataPanelMouseOver = () => panelService.show(panelName);
        ctrl.metadataPanelMouseLeave = () => panelService.hide(panelName);

        ctrl.selectedImages = selection.selectedImages;

        ctrl.hasMultipleValues = (val) => Array.isArray(val) && val.length > 1;

        ctrl.credits = function(searchText) {
            return ctrl.metadataSearch('credit', searchText);
        };

        ctrl.metadataSearch = (field, q) => {
            return mediaApi.metadataSearch(field,  { q }).then(resource => {
                return resource.data.map(d => d.key);
            });
        };

        ctrl.archiverService = archiverService(selection.stream.images$);
        selection.stream.watchUpdates(ctrl.archiverService.updates$);

        $scope.$watch(() => selection.getMetadata(), onValChange(newMetadata => {
            ctrl.rawMetadata = newMetadata;
            ctrl.images = Array.from(ctrl.selectedImages);

            if (ctrl.images.length > 0) {
                panelService.available(panelName, false);
            } else {
                panelService.unavailable(panelName, false);
            }

            ctrl.metadata = selection.getDisplayMetadata();
            ctrl.usageRights = selection.getUsageRights();
            ctrl.selectedCosts = selection.getCost();
            ctrl.selectedLabels = selection.getLabels();

            selection.canUserEdit().then(editable => {
                ctrl.userCanEdit = editable;
            });

            editsApi.getUsageRightsCategories().then((cats) => {
                var categoryCode = ctrl.usageRights.reduce((m, o) => {
                    return (m == o.data.category) ? o.data.category : 'multiple categories';
                }, ctrl.usageRights[0] && ctrl.usageRights[0].data.category);

                var usageCategory = cats.find(cat => cat.value === categoryCode);
                ctrl.usageCategory = usageCategory ? usageCategory.name : categoryCode;
            });

        }));

        ctrl.updateMetadataField = function (field, value) {
            return editsService.batchUpdateMetadataField(ctrl.images, field, value);
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
