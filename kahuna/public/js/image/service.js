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

// takes an array of objects and turns it into an object with an array of unique values
// e.g. [{ a: 1, b: 2 }, { a: 2, b: 2, c: 3 }] => { a: [1,2], b: [2], c: [3] }
imageService.factory('reduceObjectsToArrays', [function() {

    return function (objects, presetKeys) {
        return objects.reduce((prev, curr) => {
            const keys = presetKeys || Object.keys(prev).concat(Object.keys(curr));
            keys.forEach(field => {
                prev[field] = (prev[field] || []).concat([curr[field]]);
            });
            return prev;
        }, {});
    }

}]);

imageService.factory('uniqueArrayKeyValues', ['unique', function(unique) {
    return function (object) {
        return Object.keys(object).reduce((prev, field) => {
            prev[field] = unique(object[field]).filter(v => v);
            return prev;
        }, {});
    }
}])

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
                    ['$q', 'editsService', 'reduceObjectsToArrays', 'uniqueArrayKeyValues',
                    function($q, editsService, reduceObjectsToArrays, uniqueArrayKeyValues) {

    const updates$ = new Rx.Subject();
    const editableMetadata = ['title', 'description', 'specialInstructions', 'byline', 'credit'];

    function metadataService(images$) {
        const metadata$ = images$.map(images =>
            images.map(image => image.data.metadata)
        ).map(reduceMetadatas).map(uniqueArrayKeyValues);

        return { metadata$, updates$, saveField: saveFieldOnImages(images$) };
    }

    function reduceMetadatas(metadatas) {
        return reduceObjectsToArrays(metadatas, editableMetadata);
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

imageService.factory('usageRightsService',
                    ['$q', 'editsApi', 'reduceObjectsToArrays', 'uniqueArrayKeyValues',
                    function($q, editsApi, reduceObjectsToArrays, uniqueArrayKeyValues) {
    const updates$ = new Rx.Subject();
    const multiCatsCat = { name: 'Multiple categories', value: '' };
    const noRightsCat = { name: 'No Rights', value: '' };

    function getUsageRights(image) {
        return image.data.userMetadata.data.usageRights;
    }

    function usageRightsService(images$) {
        const usageRights$ = images$.map(images =>
            images.map(image => image.data.usageRights)
        ).map(usageRights => reduceObjectsToArrays(usageRights)).map(uniqueArrayKeyValues);

        const apiCategories$ = Rx.Observable.fromPromise(editsApi.getUsageRightsCategories());

        const category$ = apiCategories$.combineLatest(usageRights$, (cats, usageRights) => {
            const l = usageRights.category ? usageRights.category.length : 0;

            if (l > 1) {
                return multiCatsCat;
            } else if (l === 1) {
                return cats.find(cat => cat.value === usageRights.category[0]);
            } else {
                return noRightsCat;
            }
        });

        // Not sure we want to combine on usageRights as category already does this and there might
        // be a performance degradation, but we need to update when the usageRights list is updated.
        const model$ = category$.combineLatest(usageRights$, (cat, usageRights) => {
            if (!angular.equals(cat, noRightsCat) && !angular.equals(cat, multiCatsCat)) {
                return Object.keys(usageRights).reduce((prev, key) => {
                    if (usageRights[key] && usageRights[key].length === 1) {
                        prev[key] = usageRights[key][0];
                    }

                    return prev;
                }, {});
            } else {
                return {};
            }
        });

        const categories$ = category$.combineLatest(apiCategories$, (cat, cats) => {
            if (angular.equals(cat, multiCatsCat)) {
                return [multiCatsCat].concat(cats);
            } else if (angular.equals(cat, noRightsCat)) {
                // TODO: This will be deprecated once we have no rights as the standard option.
                return [noRightsCat].concat(cats)
            } else {
                return cats;
            }
        });


        return { categories$, category$, model$, usageRights$, updates$ };
    }

    return usageRightsService;

}]);
