import angular from 'angular';
import Rx from 'rx';
import Immutable from 'immutable';
import 'angular-bootstrap';

import './gr-panel.css!';
import '../../services/archive';
import '../../services/image-accessor';
import '../../services/image-list';
import '../../services/label';
import '../../services/panel';
import '../../edits/service';
import '../../forms/gr-xeditable/gr-xeditable';
import '../../util/rx';

export var grPanel = angular.module('grPanel', [
    'kahuna.services.archive',
    'kahuna.services.image-accessor',
    'kahuna.services.image-list',
    'kahuna.services.label',
    'kahuna.services.panel',
    'kahuna.edits.service',
    'grXeditable',
    'ui.bootstrap',
    'util.rx'
]);

grPanel.controller('GrPanel', [
    '$rootScope',
    '$scope',
    '$window',
    '$q',
    'inject$',
    'subscribe$',
    'mediaApi',
    'imageAccessor',
    'imageList',
    'selection',
    'selectedImages$',
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
        inject$,
        subscribe$,
        mediaApi,
        imageAccessor,
        imageList,
        selection,
        selectedImages$,
        labelService,
        panelService,
        archiveService,
        editsService,
        editsApi,
        onValChange) {

        var ctrl = this;

        ctrl.showUsageRights = false;

        const panelName = 'gr-panel';

        panelService.addPanel(panelName, false);
        ctrl.isVisible = panelService.isVisible(panelName);

        $rootScope.$on(
            'ui:panels:gr-panel:updated',
            () => ctrl.isVisible = panelService.isVisible(panelName)
        );
        ctrl.metadataPanelMouseOver = () => panelService.show(panelName);
        ctrl.metadataPanelMouseLeave = () => panelService.hide(panelName);


        inject$($scope, selectedImages$, ctrl, 'selectedImages');


        const selectedImagesList$ = selectedImages$.
              map(selectedImages => selectedImages.toList());


        const selectedCosts$ = selectedImagesList$.
              map(imageList.getCost).
              map(imageList.getOccurrences);
        inject$($scope, selectedCosts$, ctrl, 'selectedCosts');


        const archivedCount$ = selectedImagesList$.map(imageList.archivedCount);
        const archivedState$ = Rx.Observable.combineLatest(
            archivedCount$,
            selection.count$,
            (archivedCount, selectedCount) => {
                switch (archivedCount) {
                case 0:              return 'unarchived';
                case selectedCount:  return 'archived';
                default:             return 'mixed';
                }
            }
        );
        inject$($scope, archivedCount$, ctrl, 'archivedCount');
        inject$($scope, archivedState$, ctrl, 'archivedState');

        const selectedLabels$ = selectedImagesList$.
              map(imageList.getLabels).
              map(imageList.getOccurrences);
        inject$($scope, selectedLabels$, ctrl, 'selectedLabels');

        const selectedUsageRights$ = selectedImagesList$.map(selectedImagesList => {
            // FIXME: wrap into slightly weird shape expected by usage
            // rights editor component
            return selectedImagesList.map(image => {
                return {
                    image: image,
                    data: imageAccessor.readUsageRights(image)
                };
            });
        });
        const selectedUsageRightsArray$ = selectedUsageRights$.map(selectedUsageRights => {
            return selectedUsageRights.toArray();
        });

        const categoriesPromise = editsApi.getUsageRightsCategories();
        const usageRightsCategories$ = Rx.Observable.fromPromise(categoriesPromise);
        const selectedUsageCategory$ = Rx.Observable.combineLatest(
            selectedUsageRights$,
            usageRightsCategories$,
            (usageRights, categories) => {
                const categoryCode = usageRights.reduce((m, o) => {
                    return (m == o.data.category) ? o.data.category : 'multiple categories';
                }, usageRights.first() && usageRights.first().data.category);

                const usageCategory = categories.find(cat => cat.value === categoryCode);
                return usageCategory ? usageCategory.name : categoryCode;
            }
        );

        inject$($scope, selectedUsageRightsArray$, ctrl, 'usageRights');
        inject$($scope, selectedUsageCategory$,    ctrl, 'usageCategory');


        // FIXME: distinct?
        const selectedMetadata$ = selectedImagesList$.
              map(imageList.getMetadata).
              map(imageList.getSetOfProperties);
        const rawMetadata$ = selectedMetadata$.map(selectedMetadata => {
            return selectedMetadata.map((values, key) => {
                switch(values.size) {
                case 0:  return undefined;
                case 1:  return Array.from(values);
                default: return Array.from(values);
                }
            }).toObject();
        });
        const displayMetadata$ = selectedMetadata$.map(selectedMetadata => {
            return selectedMetadata.map((values, key) => {
                switch(values.size) {
                case 1:  return Array.from(values)[0];
                default: return undefined;
                }
            }).toObject();
        });
        inject$($scope, rawMetadata$, ctrl, 'rawMetadata');
        inject$($scope, displayMetadata$, ctrl, 'metadata');


        const selectionIsEditable$ = selectedImagesList$.
              map(list => list.map(editsService.canUserEdit).toArray()).
              map($q.all).
              flatMap(Rx.Observable.fromPromise).
              map(allEditable => allEditable.every(v => v === true));
        inject$($scope, selectionIsEditable$, ctrl, 'userCanEdit');


        subscribe$($scope, selection.isEmpty$, isEmpty => {
            if (isEmpty) {
                panelService.unavailable(panelName, false);
            } else {
                panelService.available(panelName, false);
            }
        });


        ctrl.hasMultipleValues = (val) => Array.isArray(val) && val.length > 1;

        ctrl.credits = function(searchText) {
            return ctrl.metadataSearch('credit', searchText);
        };

        ctrl.metadataSearch = (field, q) => {
            return mediaApi.metadataSearch(field,  { q }).then(resource => {
                return resource.data.map(d => d.key);
            });
        };


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
