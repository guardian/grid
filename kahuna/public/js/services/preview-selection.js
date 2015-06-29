import angular from 'angular';

import '../edits/service';

var selectionService = angular.module('kahuna.services.selection', ['kahuna.edits.service']);

selectionService.factory('selectionService', ['$q', 'editsService', function ($q, editsService) {
    var selectedImages = new Set();
    var selectedMetadata = {};
    var selectedMetadataForDisplay = {};
    var selectedCosts, selectedLabels, archivedCount;

    function _group () {
        var metadata = {};
        var cost = [];
        var labels = [];
        var totalArchived = 0;

        var allFields = [];

        selectedImages.forEach(img => {
            allFields = allFields.concat(Object.keys(img.data.metadata));

            var imgCost = img.data.cost;

            var costIndex = cost.findIndex(x => x.data === imgCost);

            if (costIndex === -1) {
                cost.push({data: imgCost, count: 1});
            } else {
                cost[costIndex].count++;
            }

            img.data.userMetadata.data.labels.data.forEach(label => {
                var index = labels.findIndex(x => x.data === label.data);

                if (index === -1) {
                    labels.push({data: label.data, count: 1});
                } else {
                    labels[index].count++;
                }
            });

            if (img.data.userMetadata.data.archived.data) {
                totalArchived++;
            }
        });

        var uniqueFields = new Set(allFields);

        selectedImages.forEach(image => {
            uniqueFields.forEach((key) => {
                metadata[key] = metadata[key] || new Set();
                metadata[key].add(image.data.metadata[key]);
            });
        });

        return {
            metadata,
            cost,
            labels,
            totalArchived
        };
    }

    function _update () {
        var grouped = _group();

        var metadata = {};

        Object.keys(grouped.metadata).forEach(function (key) {
            switch (grouped.metadata[key].size) {
                case 0: {
                    metadata[key] = undefined;
                    break;
                }
                case 1: {
                    metadata[key] = Array.from(grouped.metadata[key])[0];
                    break;
                }
                default: {
                    metadata[key] = Array.from(grouped.metadata[key]);
                    break;
                }
            }
        });

        grouped.metadata = metadata;

        return grouped;
    }

    function update () {
        var selectedImageData = _update();

        var displayMetadata = {};

        Object.keys(selectedImageData.metadata).forEach((key) => {
            if (Array.isArray(selectedImageData.metadata[key])) {
                displayMetadata[key] = undefined;
            } else {
                displayMetadata[key] = selectedImageData.metadata[key];
            }
        });

        selectedMetadata = selectedImageData.metadata;
        selectedMetadataForDisplay = displayMetadata;

        selectedCosts = selectedImageData.cost;
        selectedLabels = selectedImageData.labels;
        archivedCount = selectedImageData.totalArchived;
    }

    function canUserEdit () {
        var images = Array.from(selectedImages);

        return $q.all(images.map(i => editsService.canUserEdit(i)))
            .then(permissions => {
                /*
                `permissions` is an array of booleans and is the result of
                checking if the user can edit all the images that have been selected.

                Check that `permissions` only contains `true`,
                i.e. the user has permissions to all selected images.
                 */
                var uniquePermissions = new Set(permissions);
                return uniquePermissions.size === 1 && uniquePermissions.has(true);
            });
    }

    function add (image) {
        selectedImages.add(image);
        update();
    }

    function remove (image) {
        selectedImages.delete(image);
        update();
    }

    return {
        selectedImages,
        add,
        remove,
        canUserEdit,
        getCost: () => selectedCosts,
        getMetadata: () => selectedMetadata,
        getDisplayMetadata: () => selectedMetadataForDisplay,
        getLabels: () => selectedLabels,
        getArchivedCount: () => archivedCount,
        isSelected: (image) => selectedImages.has(image),
        toggleSelection: (image, select) => {
            return select ? add(image) : remove(image);
        },
        clear: () => selectedImages.clear()
    };
}]);


export default selectionService;
