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

imageService.factory('imagesService', ['$q', function($q) {

    function archiveCollection(images$) {
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
            const saves = images$.getValue().map(image => getArchived(image).
                put({ data: val }).
                then(archived => {
                    image.data.userMetadata.data.archived = archived;
                    return image;
                })
            );

            $q.all(saves).then(images => images$.onNext(images));
        }

        function getArchived(image) {
            return image.data.userMetadata.data.archived;
        }
    }

    return {
        archiveCollection
    };

}]);
