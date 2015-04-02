import angular from 'angular';

import '../services/api/edits-api';
import '../services/api/media-api';

export var service = angular.module('kahuna.edits.service', []);

service.factory('editsService', ['editsApi', 'mediaApi', function(editsApi, mediaApi) {

    function matches(image, edit) {
        // find that matching resource
        edit.getUri().then(uri => {
            // find the edit which we're modifying
            var edits = image.data.userMetadata.data;
            var imageEdit = Object.keys(edits)
                .map(key => edits[key])
                .find(m => {
                    return m.uri === uri;
                });

            console.log(imageEdit.data, edit.data)
            console.log(angular.equals(imageEdit.data, edit.data));
        });
    }

    // TODO: At the moment we are passing the image as we don't have a link back
    // to is - I want to test this as a methodology first, and we'd have to think
    // about bloating the image response.
    function update(resource, data, image) {
        resource.post({ data }).then(edit => {
            setTimeout(() => image.get().then(image => matches(image, edit)), 1000);
        });
    }



    return { update };

}]);
