import angular from 'angular';

import '../services/api/edits-api';
import '../services/api/media-api';

export var service = angular.module('kahuna.edits.service', []);

service.factory('editsService', ['$q', 'editsApi', 'mediaApi', 'poll', function($q, editsApi, mediaApi, poll) {

    const pollFrequency = 500; // ms
    const pollTimeout   = 20 * 1000; // ms

    function matches(image, edit) {
        // find that matching resource
        return edit.getUri().then(uri => {
            // find the edit which we're modifying
            const edits = image.data.userMetadata.data;
            const imageEdit = Object.keys(edits)
                .map(key => edits[key])
                .find(m => {
                    return m.uri === uri;
                });

            return angular.equals(imageEdit.data, edit.data) ? edit.data : $q.reject('data not matching');
        });
    }

    // TODO: At the moment we are passing the image as we don't have a link back
    // to is - I want to test this as a methodology first, and we'd have to think
    // about bloating the image response.
    function update(resource, data, image) {
        return resource.post({ data }).then(edit => {
            let checkSynced = () => image.get().then(image => matches(image, edit));
            let synced = poll(checkSynced, pollFrequency, pollTimeout);

            return synced;
        });
    }



    return { update };

}]);
