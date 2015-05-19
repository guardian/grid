import angular from 'angular';

import '../edits/service';

var selectionService = angular.module('kahuna.services.selection', ['kahuna.edits.service']);

selectionService.factory('selectionService', [
    'editsService',
    function (editsService) {
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
                    case 0:
                        displayMetadata[key] = undefined;
                        break;
                    case 1:
                        displayMetadata[key] = Array.from(metadata[key])[0];
                        break;
                    default:
                        displayMetadata[key] = Array.from(metadata[key]);
                        break;
                }
            });

            selectedMetadata = displayMetadata;
        }

        return {
            selectedImages: selectedImages,
            getMetadata: () => selectedMetadata,
            updateMetadata: updateMetadata,
            add: (image, callback, args) => {
                selectedImages.add(image);
                if (typeof callback === 'function') {
                    callback.call(this, args);
                }
            },
            remove: (image, callback, args) => {
                selectedImages.delete(image);
                if (typeof callback === 'function') {
                    callback.call(this, args);
                }
            },
            clear: () => {
                for (let image of selectedImages) {
                    image.selected = false;
                }

                selectedImages.clear();
            }
        }
    }
]);


export default selectionService;
