import angular from 'angular';

var selectionService = angular.module('kahuna.services.selection', ['kahuna.edits.service']);

selectionService.factory('selectionService', [function () {
    var selectedImages = new Set();
    var selectedMetadata = {};

    function groupMetadata (fields) {
        var metadata = {};

        fields.forEach((field) => {
            metadata[field] = metadata[field] || new Set();

            for (let image of selectedImages) {
                metadata[field].add(image.data.metadata[field]);
            }
        });

        return metadata;
    }

    function updateMetadata (fields) {
        var metadata = groupMetadata(fields);

        var displayMetadata = {};

        Object.keys(metadata).forEach(function (key) {
            switch (metadata[key].size) {
                case 0: {
                    displayMetadata[key] = undefined;
                    break;
                }
                case 1: {
                    displayMetadata[key] = Array.from(metadata[key])[0];
                    break;
                }
                default: {
                    displayMetadata[key] = Array.from(metadata[key]);
                    break;
                }
            }
        });

        selectedMetadata = displayMetadata;
    }

    return {
        selectedImages: selectedImages,

        getMetadata: () => selectedMetadata,

        updateMetadata: updateMetadata,

        isSelected: (image) => selectedImages.has(image),

        add: (image, fields) => {
            selectedImages.add(image);
            updateMetadata(fields);
        },

        remove: (image, fields) => {
            selectedImages.delete(image);
            updateMetadata(fields);
        },

        clear: () => selectedImages.clear()
    };
}]);


export default selectionService;
