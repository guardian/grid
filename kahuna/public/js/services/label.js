import angular from 'angular';

var labelService = angular.module('kahuna.services.label', []);

labelService.factory('labelService',
                     ['$rootScope', '$q', 'apiPoll', 'imageAccessor',
                      function ($rootScope, $q, apiPoll, imageAccessor) {

    function readLabelName(label) {
        return label.data;
    }

    function readLabelsName(labels) {
        return labels.map(readLabelName);
    }

    function labelsEquals(labelsA, labelsB) {
        return angular.equals(
            readLabelsName(labelsA).sort(),
            readLabelsName(labelsB).sort()
        );
    }

    function untilLabelsEqual(image, expectedLabels) {
        return image.get().then(apiImage => {
            const apiLabels = imageAccessor.readLabels(apiImage);
            if (labelsEquals(apiLabels, expectedLabels)) {
                return apiImage;
            } else {
                return $q.reject();
            }
        });
    }

    function remove (image, label) {
        var existingLabels = imageAccessor.readLabels(image);
        var labelIndex = existingLabels.findIndex(lbl => lbl.data === label);
        if (labelIndex !== -1) {
            return existingLabels[labelIndex]
                .delete()
                .then(newLabels => apiPoll(() => untilLabelsEqual(image, newLabels.data)))
                .then(newImage => {
                    $rootScope.$emit('image-updated', newImage, image);
                    return newImage;
                });
        }
    }

    function add (image, labels) {
        labels = labels.filter(label => label && label.trim().length > 0);

        return image.data.userMetadata.data.labels
            .post({data: labels})
            .then(newLabels => apiPoll(() => untilLabelsEqual(image, newLabels.data)))
            .then(newImage => {
                $rootScope.$emit('image-updated', newImage, image);
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
