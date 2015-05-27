import angular from 'angular';

var selectionService = angular.module('kahuna.services.selection', ['kahuna.edits.service']);

selectionService.factory('selectionService', [function () {
    var selectedImages = new Set();
    var selectedMetadata = {};

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
        var metadata = groupMetadata();

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

    function add (image) {
        selectedImages.add(image);
        updateMetadata();
    }

    function remove (image) {
        selectedImages.delete(image);
        updateMetadata();
    }

    return {
        selectedImages: selectedImages,

        getMetadata: () => selectedMetadata,

        updateMetadata: updateMetadata,

        isSelected: (image) => selectedImages.has(image),

        add: add,

        remove: remove,

        toggleSelection: (image, select) => {
            return select ? add(image) : remove(image);
        },

        clear: () => selectedImages.clear()
    };
}]);


export default selectionService;
