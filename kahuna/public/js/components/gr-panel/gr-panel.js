import angular from 'angular';
import 'angular-bootstrap';

import './gr-panel.css!';
import '../../services/preview-selection';
import '../../services/label';
import '../../services/panel';
import '../../services/archive';
import '../../edits/service';
import '../../forms/gr-xeditable/gr-xeditable';

export var grPanel = angular.module('grPanel', [
    'kahuna.services.selection',
    'kahuna.services.label',
    'kahuna.services.panel',
    'kahuna.services.archive',
    'kahuna.edits.service',
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
    'archiveService',
    'editsService',
    'editsApi',
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
        archiveService,
        editsService,
        editsApi,
        onValChange) {

        var ctrl = this;

        const panelName = 'gr-panel';

        panelService.addPanel(panelName, false);
        ctrl.isVisible = panelService.isVisible(panelName);

        $rootScope.$on(
            'ui:panels:' + panelName + ':updated',
            () => ctrl.isVisible = panelService.isVisible(panelName)
        );
        ctrl.showMetadataPanelMouseOver = () => panelService.setVisible(panelName);
        ctrl.showMetadataPanelMouseLeave = () => panelService.setInvisible(panelName);

        ctrl.selectedImages = selection.selectedImages;

        ctrl.hasMultipleValues = (val) => Array.isArray(val) && val.length > 1;

        ctrl.clear = () => {
            panelService.setInvisible(panelName, false);
            panelService.setUnavailable(panelName, false);

            selection.clear();
        };

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
            ctrl.images = Array.from(ctrl.selectedImages);

            if (ctrl.images.length > 0) {
                panelService.setAvailable(panelName, false);
            } else {
                panelService.setUnavailable(panelName, false);
            }

            ctrl.metadata = selection.getDisplayMetadata();
            ctrl.usageRights = selection.getUsageRights();
            ctrl.selectedCosts = selection.getCost();
            ctrl.selectedLabels = selection.getLabels();
            ctrl.archivedCount = selection.getArchivedCount();

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

            ctrl.showCosts = ctrl.selectedCosts.length === 1 ?
                ctrl.selectedCosts[0].data !== 'free' :
                ctrl.selectedCosts.length > 1;

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
