import angular from 'angular';

import '../edits/service';

var selectionService = angular.module('kahuna.services.selection', ['kahuna.edits.service']);

selectionService.factory('selectionService', ['$q', 'editsService', function ($q, editsService) {
    var selectedImages = new Set();
    var selectedMetadata = {};
    var selectedMetadataForDisplay = {};

    function groupMetadata () {
        var metadata = {};

        for (let image of selectedImages) {
            Object.keys(image.data.metadata).forEach((key) => {
                metadata[key] = metadata[key] || new Set();
                metadata[key].add(image.data.metadata[key]);
            });
        }
        return metadata;
    }

    function updateMetadata () {
        var groupedMetadata = groupMetadata();

        var metadata = {};

        Object.keys(groupedMetadata).forEach(function (key) {
            switch (groupedMetadata[key].size) {
                case 0: {
                    metadata[key] = undefined;
                    break;
                }
                case 1: {
                    metadata[key] = Array.from(groupedMetadata[key])[0];
                    break;
                }
                default: {
                    metadata[key] = Array.from(groupedMetadata[key]);
                    break;
                }
            }
        });

        return metadata;
    }

    function updateDisplayMetadata () {
        var metadata = updateMetadata();

        var displayMetadata = {};

        Object.keys(metadata).forEach((key) => {
            if (Array.isArray(metadata[key])) {
                displayMetadata[key] = undefined;
            } else {
                displayMetadata[key] = metadata[key];
            }
        });

        selectedMetadata = metadata;
        selectedMetadataForDisplay = displayMetadata;
    }

    function canUserEdit () {
        var promises = [];

        for (let image of selectedImages) {
            promises.push(editsService.canUserEdit(image));
        }

        return $q.all(promises).then(values => {
            var valueSet = new Set(values);
            return valueSet.size === 1 && valueSet.has(true);
        });
    }

    function add (image) {
        selectedImages.add(image);
        updateDisplayMetadata();
    }

    function remove (image) {
        selectedImages.delete(image);
        updateDisplayMetadata();
    }

    return {
        selectedImages,
        add,
        remove,
        canUserEdit,
        getMetadata: () => selectedMetadata,
        getDisplayMetadata: () => selectedMetadataForDisplay,
        isSelected: (image) => selectedImages.has(image),
        toggleSelection: (image, select) => {
            return select ? add(image) : remove(image);
        },
        clear: () => selectedImages.clear()
    };
}]);


export default selectionService;
