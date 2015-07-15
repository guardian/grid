import angular from 'angular';

var labelService = angular.module('kahuna.services.label', []);

labelService.factory('labelService', ['$rootScope', '$q', function ($rootScope, $q) {
    function remove (image, label) {
        var existingLabels = image.data.userMetadata.data.labels.data;
        var labelIndex = existingLabels.findIndex(lbl => lbl.data === label);

        if (labelIndex !== -1) {
            return existingLabels[labelIndex]
                .delete()
                .then(newLabels => {
                    image.data.userMetadata.data.labels = newLabels;
                    $rootScope.$emit('image-updated', image, image);
                    return image;
                });
        }
    }

    function add (image, labels) {
        labels = labels.filter(label => label && label.trim().length > 0);

        return image.data.userMetadata.data.labels
            .post({data: labels})
            .then(newLabels => {
                image.data.userMetadata.data.labels = newLabels;
                $rootScope.$emit('image-updated', image, image);
                return image;
            });
    }

    function batchAdd (images, labels) {
        return $q.all(images.map(image => add(image, labels)));
    }

    function batchRemove (images, label) {
        return $q.all(images.map(image => remove(image, label)));
    }

    return {
        add,
        remove,
        batchAdd,
        batchRemove
    };
}]);

export default labelService;
