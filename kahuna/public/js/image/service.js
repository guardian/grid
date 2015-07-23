import angular from 'angular';

import '../edits/service';

export const imageService = angular.module('gr.image.service', ['kahuna.edits.service']);

imageService.factory('imageService', ['editsService', function(editsService) {
    function forImage(image) {
        return {
            usageRights: usageRights(image),
            states: getStates(image)
        };
    }

    function usageRights(image) {
        // we override the data with the overrides data from the edits API.
        const data = angular.extend({},
            image.data.usageRights,
            image.data.userMetadata.data.usageRights.data
        );
        const resource = image.data.userMetadata.data.usageRights;

        const save = newData =>
            editsService.update(resource, newData, image).then(resource => resource.data);

        const remove = () =>
            editsService.remove(resource, image).then(() => image.data.usageRights);

        return { data, save, remove };
    }

    function hasExportsOfType(image, type) {
        return image.data.exports &&
                image.data.exports.some(ex => ex.type === type);
    }

    function getStates(image) {
        return {
            cost: image.data.cost,
            hasCrops: hasExportsOfType(image, 'crop'),
            isValid: image.data.valid
        };
    }

    return image => forImage(image);
}]);



imageService.factory('imagesService', function() {
    return {
        // This is just to omve it out the way.
        // We need to rethink this as it's as good as mutation and stream emitting should
        // be in one place i.e. the image selection service
        edited: (images$, edits) => images$.onNext(edits)
    }
});


imageService.factory('metadataService',
                    ['$q', 'imagesService', 'editsService',
                    function($q, imagesService, editsService) {

    const editableMetadata = ['title', 'description', 'specialInstructions', 'byline', 'credit'];

    function fromStream(images$) {
        const metadata$ = images$.map(images =>
            images.map(image => image.data.metadata)
        ).map(reduceMetadatas).map(cleanReducedMetadata);


        return { metadata$, saveField: saveFieldOnImages(images$) };
    }

    function reduceMetadatas(metadatas) {
        return metadatas.reduce((prev, curr) => {
            editableMetadata.forEach(field => {
                prev[field] = (prev[field] || []).concat([curr[field]]);
            });
            return prev;
        }, {});
    }

    function cleanReducedMetadata(metadata) {
        return editableMetadata.reduce((prev, field) => {
            prev[field] = unique(metadata[field]).filter(v => v);
            return prev;
        }, {});
    }

    function updateImage(oldImage, newImage) {
        // TODO: we could probably just get the image from the edits service.
        // update the bits that could have changed -> the client could be a little more
        // stupid here.
        oldImage.data.metadata = newImage.data.metadata;
        oldImage.data.valid = newImage.data.valid;
        oldImage.data.userMetadata.data.metadata = newImage.data.userMetadata.data.metadata;

        return oldImage;
    }

    function unique(arr) {
        return arr.reduce((prev, curr) =>
            prev.indexOf(curr) !== -1 ? prev : prev.concat([curr]), []);
    }

    function getMetadata(image) {
        return image.data.userMetadata.data.metadata;
    }

    function saveFieldOnImages(images$) {
        return function saveField(field, value) {
            // TODO: A better implementation?
            const edits = images$.getValue().map(image => {
                var data;
                const fieldData = {[field]: value};
                const overrideData = getMetadata(image).data;
                const override = overrideData[field];
                const sameAsOverride = override === value;
                const sameAsOriginal = image.data.originalMetadata[field] === value;

                // beware - mutants!
                if (sameAsOriginal && override) {
                    // remove the field if it's the same as the original.
                    data = Object.keys(overrideData).reduce((prev, curr) => {
                        if (curr !== field) {
                            prev[curr] = overrideData[field]
                        }
                        return prev;
                    }, {});
                } else if (!sameAsOriginal && !sameAsOverride) {
                    data = angular.extend({}, overrideData, fieldData);
                }

                if (data) {
                    return editsService
                        .update(getMetadata(image), data, image)
                        .then(() => image.get())
                        .then(newImage => updateImage(image, newImage))
                }

                // if nothing has changed, just return the image.
                const def = $q.defer();
                def.resolve(image);
                return def.promise;
            });

            $q.all(edits).then(images => imagesService.edited(images$, images));
        }
    }

    return fromStream;
}]);


imageService.factory('archivedService', ['$q', function($q) {

    function archivedService(images$) {
        const count$ = images$.map(images => images.length);
        const archivedCount$ = images$.map(images => images.filter(image =>
            getArchived(image).data === true
        ).length);
        const notArchivedCount$ = images$.map(images => images.filter(image =>
            getArchived(image).data === false
        ).length);

        return { add, remove, count$, archivedCount$, notArchivedCount$ };

        function add() {
            save(true);
        }

        function remove() {
            save(false);
        }

        function save(val) {
            const edits = images$.getValue().map(image => getArchived(image).
                put({ data: val }).
                then(archived => {
                    image.data.userMetadata.data.archived = archived;
                    return image;
                })
            );

            $q.all(edits).then(images => imagesService.edited(images$, images));
        }

        function getArchived(image) {
            return image.data.userMetadata.data.archived;
        }
    }

    return archivedService;

}]);
