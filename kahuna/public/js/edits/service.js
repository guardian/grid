import angular from 'angular';

import '../services/api/edits-api';
import '../services/api/media-api';

export var service = angular.module('kahuna.edits.service', []);

// TODO: For now we're sending over the image so we can compare against it to
// see when it's synced. We should have a link on the resource to be able to do
// this.
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
            const findIn = Object.keys(edits)
                .map(key => edits[key])
                .find(r => {
                    return r.uri === uri;
                });
            const stillPresent = findIn.data &&
                                 findIn.data.find(r => r.uri === edit.uri);

            return stillPresent ?
                $q.reject('data not matching') :
                collection.get();
        });
    }

    function getSynced(image, check) {
        const checkSynced = () => image.get().then(check);
        return poll(checkSynced, pollFrequency, pollTimeout);
    }

    function update(resource, data, originalImage) {
        return resource.post({ data }).then(edit =>
            getSynced(originalImage, newImage => matches(edit, newImage)));
    }

    // This is a bit of a hack function as we don't have a way of deleting from
    // a collection on the API, only per label / right. We should probably
    // choose between working with the collection e.g. labels, or working with
    // each collection item directly, whereas now, for adding, we use the
    // collection, and for deleting we use the collection item
    function deleteFromCollection(resource, collection, originalImage) {
        return resource.delete().then(edit =>
            getSynced(originalImage, newImage => missing(edit, collection, newImage)));
    }



    return { update, deleteFromCollection };

}]);
