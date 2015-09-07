import angular from 'angular';
import Rx from 'rx';
import Immutable from 'immutable';
import 'angular-bootstrap';

import './gr-panel.css!';
import '../../services/archive';
import '../../services/image-accessor';
import '../../services/label';
import '../../services/panel';
import '../../edits/service';
import '../../forms/gr-xeditable/gr-xeditable';
import '../../util/rx';

export var grPanel = angular.module('grPanel', [
    'kahuna.services.archive',
    'kahuna.services.image-accessor',
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


        // TODO: share selectedImages.toList()

        function countOccurrences(collection) {
            // TODO: use immutable map
            return collection.reduce((counts, item) => {
                const currentCount = counts.get(item) || 0;
                counts.set(item, currentCount + 1);
                return counts;
            }, new Map());
        }

        function occurrencesToTuple(counts) {
            return Array.from(counts.entries()).map(([data, count]) => {
                return {data, count};
            });
        }

        const selectedCosts$ = selectedImages$.map(selectedImages => {
            const costs = selectedImages.toList().map(imageAccessor.readCost);
            const valueCounts = countOccurrences(costs);
            return occurrencesToTuple(valueCounts);
        });
        inject$($scope, selectedCosts$, ctrl, 'selectedCosts');


        const archivedCount$ = selectedImages$.map(selectedImages => {
            return selectedImages.toList().filter(imageAccessor.isArchived).size;
        });
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


        const selectedLabels$ = selectedImages$.map(selectedImages => {
            const labels = selectedImages.toList().
                  flatMap(imageAccessor.readLabels).
                  map(label => label.data);
            const valueCounts = countOccurrences(labels);
            return occurrencesToTuple(valueCounts);
        });
        inject$($scope, selectedLabels$, ctrl, 'selectedLabels');


        const selectedUsageRights$ = selectedImages$.map(selectedImages => {
            // FIXME: wrap into slightly weird shape expected by usage
            // rights editor component
            return selectedImages.toList().map(image => {
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


        function pairsAsObject(pairs) {
            return pairs.reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {});
        }
        // FIXME: distinct?
        const selectedMetadata$ = selectedImages$.map(selectedImages => {
            const metadata = new Map();
            const imagesMetadata = selectedImages.toList().map(imageAccessor.readMetadata);
            const metadataKeys = imagesMetadata.flatMap(Object.keys);
            imagesMetadata.forEach(meta => {
                metadataKeys.forEach(key => {
                    const values = metadata.get(key) || new Set();
                    values.add(meta[key]);
                    metadata.set(key, values);
                });
            });
            return metadata;
        });
        const rawMetadata$ = selectedMetadata$.map(selectedMetadata => {
            const metadataMixedPairs = Array.from(selectedMetadata.entries()).map(([key, values]) => {
                switch(values.size) {
                case 0:  return [key, undefined];
                case 1:  return [key, Array.from(values)[0]];
                default: return [key, Array.from(values)];
                }
            });
            const metadataMixedObject = pairsAsObject(metadataMixedPairs);

            return metadataMixedObject;
        });
        const displayMetadata$ = selectedMetadata$.map(selectedMetadata => {
            const metadataMixedPairs = Array.from(selectedMetadata.entries()).map(([key, values]) => {
                switch(values.size) {
                case 1:  return [key, Array.from(values)[0]];
                default: return [key, undefined];
                }
            });
            const metadataMixedObject = pairsAsObject(metadataMixedPairs);

            return metadataMixedObject;
        });
        inject$($scope, rawMetadata$, ctrl, 'rawMetadata');
        inject$($scope, displayMetadata$, ctrl, 'metadata');


        // TODO: move to helper?
        const selectionIsEditable$ = selectedImages$.flatMap(selectedImages => {
            const allEditablePromise = $q.
                all(selectedImages.map(editsService.canUserEdit).toArray()).
                then(allEditable => allEditable.every(v => v === true));
            return Rx.Observable.fromPromise(allEditablePromise);
        })
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
