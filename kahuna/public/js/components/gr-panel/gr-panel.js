import angular from 'angular';
import 'angular-bootstrap';
import JSZip from 'jszip';
import JSZipUtils from 'jszip-utils';

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
    '$http',
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
        $http,
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

        ctrl.downloadAll = function() {
            const zip = new JSZip();
            const imagePromises = ctrl.images.map(image => {
                const defer = $q.defer();
                const imageEl = document.createElement('img');
                imageEl.setAttribute('crossOrigin', 'anonymous');
                imageEl.src = image.data.source.secureUrl;

                imageEl.addEventListener('load', () => {
                    let dataStuff = createDataFile(imageEl, image.data.source.dimensions);
                    zip.file(image.data.id+'.jpg', dataStuff);
                    defer.resolve();
                });

                return defer.promise;
            });

            $q.all(imagePromises).then(() => {
                const file = zip.generate({ type: 'uint8array' });
                const blob = new Blob([file], { type: 'application/zip' });
                const url = URL.createObjectURL(blob);

                window.location = url;

            });
        };

        function createDataFile(imageEl, { width, height }) {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(imageEl, 0, 0);

            return convertDataURIToBinary(canvas.toDataURL());
        }

        function convertDataURIToBinary(dataURI) {
            var BASE64_MARKER = ';base64,';
            var i = 0;
            var base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
            var base64 = dataURI.substring(base64Index);
            var raw = window.atob(base64);
            var rawLength = raw.length;
            var array = new Uint8Array(new ArrayBuffer(rawLength));

            for(i; i < rawLength; i++) {
            array[i] = raw.charCodeAt(i);
            }
            return array;
        }
    }
]);

