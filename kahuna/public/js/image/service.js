import angular from 'angular';
import Rx from 'rx';

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


imageService.factory('unique', function() {
    return arr => {
        return arr.reduce((prev, curr) =>
            prev.indexOf(curr) !== -1 ? prev : prev.concat([curr]), []);
    };
});

imageService.factory('labelsService', ['$q', 'unique', function($q, unique) {
    const updates$ = new Rx.Subject();

    function getLabels(image) {
        return image.data.userMetadata.data.labels;
    }

    function labelsService(images$) {
        const labels$ = images$.map(uniqueLabels);

        return { add, remove, updates$, labels$ };

        function uniqueLabels(images) {
            return unique(images.reduce((prev, curr) =>
                prev.concat(curr.data.userMetadata.data.labels.data.map(l => l.data)), []));
        }

        function remove(label) {
            if (label) {
                const edits = images$.getValue().map(image => {
                    const labelResource =
                        getLabels(image).data.find(labelResource => labelResource.data === label);

                    if (labelResource) {
                        return labelResource.delete().then(labels => {
                            image.data.userMetadata.data.labels = labels;
                            return image;
                        });
                    }
                }).filter(v => v);

                $q.all(edits).then(images => updates$.onNext(images));
            }
        }

        function add(label) {
            if (label) {
                const edits = images$.getValue().map(image => getLabels(image).
                    post({ data: [label] }).
                    then(labels => {
                        image.data.userMetadata.data.labels = labels;
                        return image;
                    })
                );

                $q.all(edits).then(images => updates$.onNext(images));
            }
        }
    }

    return labelsService;

}]);


imageService.factory('metadataService',
                    ['$q', 'editsService', 'unique',
                    function($q, editsService, unique) {

    const updates$ = new Rx.Subject();
    const editableMetadata = ['title', 'description', 'specialInstructions', 'byline', 'credit'];

    function metadataService(images$) {
        const metadata$ = images$.map(images =>
            images.map(image => image.data.metadata)
        ).map(reduceMetadatas).map(cleanReducedMetadata);

        return { metadata$, updates$, saveField: saveFieldOnImages(images$) };
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
                            prev[curr] = overrideData[field];
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
                        .then(newImage => updateImage(image, newImage));
                }
            }).filter(v => v);

            $q.all(edits).then(images => updates$.onNext(images));
        };
    }

    return metadataService;
}]);


imageService.factory('archivedService', ['$q', function($q) {
    const updates$ = new Rx.Subject();

    function getArchived(image) {
        return image.data.userMetadata.data.archived;
    }

    function archivedService(images$) {
        const count$ = images$.map(images => images.length);
        const archivedCount$ = images$.map(images => images.filter(image =>
            getArchived(image).data === true
        ).length);
        const notArchivedCount$ = images$.map(images => images.filter(image =>
            getArchived(image).data === false
        ).length);

        return { add, remove, updates$, count$, archivedCount$, notArchivedCount$ };

        function add() {
            save(true);
        }

        function remove() {
            save(false);
        }

        function save(val) {
            const edits = images$.getValue().map(image =>
                getArchived(image).
                    put({ data: val }).
                    then(archived => {
                        image.data.userMetadata.data.archived = archived;
                        return image;
                    })
            );

            $q.all(edits).then(images => updates$.onNext(images));
        }
    }

    return archivedService;

}]);

imageService.factory('usageRightsService', ['$q', 'unique', 'editsApi', function($q, unique, editsApi) {
    const updates$ = new Rx.Subject();
    const category$ = new Rx.Subject();

    function getUsageRights(image) {
        return image.data.userMetadata.data.usageRights;
    }

    function usageRightsService(images$) {
        const usageRights$ = images$.map(images =>
            images.map(image => image.data.usageRights)
        ).map(reduceUsageRights).map(cleanReducedUsageRights);

        return { usageRights$, updates$ };
    }

    function reduceUsageRights(usageRights) {
        return usageRights.reduce((prev, curr) => {
            Object.keys(prev).concat(Object.keys(curr)).forEach(field => {
                prev[field] = (prev[field] || []).concat([curr[field]]);
            });
            return prev;
        }, {});
    }

    function cleanReducedUsageRights(usageRights) {
        return Object.keys(usageRights).reduce((prev, field) => {
            prev[field] = unique(usageRights[field]).filter(v => v);
            return prev;
        }, {});
    }

    return usageRightsService;

}]);
