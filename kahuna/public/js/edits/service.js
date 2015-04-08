import angular from 'angular';

import '../services/api/edits-api';
import '../services/api/media-api';

export var service = angular.module('kahuna.edits.service', []);

service.factory('editsService', ['$q', 'editsApi', 'mediaApi', 'poll', function($q, editsApi, mediaApi, poll) {

    const pollFrequency = 500; // ms
    const pollTimeout   = 20 * 1000; // ms

    function matches(edit, image) {
        // find that matching resource
        return edit.getUri().then(uri => {
            // find the edit which we're modifying
            const edits = image.data.userMetadata.data;
            const imageEdit = Object.keys(edits)
                .map(key => edits[key])
                .find(r => {
                    return r.uri === uri;
                });

            return angular.equals(imageEdit.data, edit.data) ? edit : $q.reject('data not matching');
        });
    }

    function missing(edit, collection, image) {
        return collection.getUri().then(uri => {
            // find the edit which we're modifying
            const edits = image.data.userMetadata.data;
            const shouldBeDeleted = Object.keys(edits)
                .map(key => edits[key])
                .find(r => {
                    return r.uri === uri;
                }).data.find(r => r.uri === edit.uri);

            return shouldBeDeleted ?
                $q.reject('data not matching') :
                collection.get();
        });
    }

    function getSynced(image, check) {
        const checkSynced = () => image.get().then(check);
        return poll(checkSynced, pollFrequency, pollTimeout);
    }

    // TODO: At the moment we are passing the image as we don't have a link back
    // to is - I want to test this as a methodology first, and we'd have to think
    // about bloating the image response.
    function update(resource, data, originalImage) {
        return resource.post({ data }).then(edit =>
            getSynced(originalImage, newImage => matches(edit, newImage)));
    }

    function deleteFromCollection(resource, collection, originalImage) {
        return resource.delete().then(edit =>
            getSynced(originalImage, newImage => missing(edit, collection, newImage)));
    }



    return { update, deleteFromCollection };

}]);
