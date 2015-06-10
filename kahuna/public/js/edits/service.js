import angular from 'angular';

import '../services/api/edits-api';
import '../services/api/media-api';

export var service = angular.module('kahuna.edits.service', []);

// TODO: For now we're sending over the image so we can compare against it to
// see when it's synced. We should have a link on the resource to be able to do
// this.
service.factory('editsService',
                ['$rootScope', '$q', 'editsApi', 'mediaApi', 'poll',
                 function($rootScope, $q, editsApi, mediaApi, poll) {

    const pollFrequency = 500; // ms
    const pollTimeout   = 20 * 1000; // ms

    /**
     * @param edit {Resource} the edit you'd like to match
     * @param image {Resource} the image which you're searching in
     * @return {Promise.<Resource>}
     */
    function findMatchingEditInImage(edit, image) {
        return edit.getUri().then(uri => {
            const edits = image.data.userMetadata.data;

            const matchingEdit = Object.keys(edits)
                                       .map(key => edits[key])
                                       .find(r => r.uri === uri);

            return matchingEdit;
        });
    }

    /**
     * Searches for the `edit` in `image` and compares the two
     * @param edit {Resource}
     * @param image {Resource}
     * @returns {Promise.<Resource>|reject} return the `edit` resource on `success`
     */
    function matches(edit, image) {
        // find that matching resource
        return findMatchingEditInImage(edit, image).then(matchingEdit =>
            matchingEdit && angular.equals(matchingEdit.data, edit.data) ?
                edit : $q.reject('data not matching')
        );
    }

    /**
     * Makes sure the image's edit is empty ({} || [])
     * @param edit {Resource}
     * @param image {Resource}
     * @returns {Promise.<Resource>|reject} return the now empty edit
     */
    function isEmpty(edit, image) {
        // find that matching resource
        return findMatchingEditInImage(edit, image).then(matchingEdit =>
            angular.equals(matchingEdit.data, {}) || angular.equals(matchingEdit.data, []) ?
                matchingEdit : $q.reject('data not matching')
        );
    }

    /**
     *
     * @param image {Resource} image to observe for synchronisation
     * @param check {Function} a function that takes the new image as an argument
     * to compare against
     * @returns {Promise}
     */
    function getSynced(image, check) {
        const checkSynced = () => image.get().then(check);
        return poll(checkSynced, pollFrequency, pollTimeout);
    }

    /**
     * @param resource {Resource} resource to update
     * @param data {*} add to original `data`
     * @param originalImage {Resource} the image used to check if we've re-indexed yet
     * @returns {Promise.<Resource>} completed when information is synced
     */
    function add(resource, data, originalImage) {
        runWatcher(resource, 'update-start');

        return resource.post({ data }).then(edit =>
            getSynced(originalImage, newImage => matches(edit, newImage))).
            then(edit => {
                runWatcher(resource, 'update-end');
                return edit;
            }).
            catch(() => runWatcher(resource, 'update-error'));
    }

    /**
     * @param resource {Resource} resource to update
     * @param data {*} PUTs `data` and replaces old data
     * @param originalImage {Resource} the image used to check if we've re-indexed yet
     * @returns {Promise.<Resource>} completed when information is synced
     */
    function update(resource, data, originalImage) {
        runWatcher(resource, 'update-start');

        return resource.put({ data }).then(edit =>
            getSynced(originalImage, newImage => matches(edit, newImage))).
            then(edit => {
                runWatcher(resource, 'update-end');
                return edit;
            }).
            catch(e => {
                runWatcher(resource, 'update-error');
                return $q.reject(e);
            });

    }

    function remove(resource, originalImage) {
        runWatcher(resource, 'update-start');

        return resource.delete().then(() =>
            getSynced(originalImage, newImage => isEmpty(resource, newImage)).
            then(emptyEdit => {
                runWatcher(resource, 'update-end');
                return emptyEdit;
            }).
            catch(() => runWatcher(resource, 'update-error')));
    }



    // Event handling
    // TODO: Use proper names from http://en.wikipedia.org/wiki/Watcher_%28comics%29
    /**
     * @type {Map.<String => Map>} a map with key as the resource URI and value
     * as a watcher Map (see `createWatcher`).
     */
    const watchers = new Map();

    /**
     * @returns {Map.<String => Set>} a map of `key = event` and a Set of
     * callback functions to rn on that event.
     */
    const publicWatcherEvents = ['update-start', 'update-end', 'update-error'];
    function createWatcher() {
        return new Map(
            publicWatcherEvents.map(event => [event, new Set()])
        );
    }

    function runWatcher(resource, event) {
        resource.getUri().then(uri => {
            const watcher = watchers.get(uri);

            if (watcher) {
                watcher.get(event).forEach(cb => cb());
            }
        });
    }

    /**
     * @param resource {Resource}
     * @param event {String} event that matches in `publicEvents`
     * @param cb {Function} callback to run on event
     * @return {Function} function you should run to de-register event
     */
    function on(resource, event, cb) {
        resource.getUri().then(uri => {
            var watcher = watchers.get(uri);

            if (!watcher) {
                watchers.set(uri, createWatcher());
                // just a wee bit of mutability as we don't have `Option`s just `undefined`s
                watcher = watchers.get(uri);
            }

            watcher.get(event).add(cb);
        });

        return () => off(resource, event, cb);
    }

    function off(resource, event, cb) {
        resource.getUri().then(uri => {
            watchers.get(uri).get(event).delete(cb);
        });
    }

    function canUserEdit(image) {
        return image.getLink('edits')
            .then(() => true, () => false);
    }

    function getMetadataDiff (image, metadata) {
        var diff = {};

        // jscs has a maximumLineLength of 100 characters, hence the line break
        var keys = new Set(Object.keys(metadata).concat(
            Object.keys(image.data.originalMetadata)));

        // Keywords is an array, the comparison below only works with string comparison.
        // For simplicity, ignore keywords as we're not updating this field at the moment.
        keys.delete('keywords');

        keys.forEach((key) => {
            if (metadata[key] !== image.data.originalMetadata[key]) {
                // if the user has provided an override of '' (e.g. they want remove the title),
                // angular sets the value in the object to undefined.
                // We need to use an empty string in the PUT request to obey user input.
                diff[key] = metadata[key] || '';
            }
        });

        return diff;
    }

    function updateMetadataField (image, field, value) {
        var metadata = image.data.metadata;

        if (metadata[field] === value) {
            /*
             Nothing has changed.

             Per the angular-xeditable docs, returning false indicates success but model
             will not be updated.

             http://vitalets.github.io/angular-xeditable/#onbeforesave

             NOTE: Tying a service to a UI component isn't ideal as it means
             consumers of this function have to either xeditable or adopt the
             same behaviour as xeditable.
             */

            return Promise.resolve(false);
        }

        var proposedMetadata = angular.copy(metadata);
        proposedMetadata[field] = value;

        var changed = getMetadataDiff(image, proposedMetadata);

        return update(image.data.userMetadata.data.metadata, changed, image)
            .then(() => {
                return image.get().then(updatedImage => {
                    $rootScope.$emit('image-updated', updatedImage, image);
                    return updatedImage;
                });
            });
    }

    function batchUpdateMetadataField (images, field, value) {
        return $q.all(images.map(image => updateMetadataField(image, field, value)));
    }

    return { update, add, on, remove, canUserEdit, updateMetadataField, batchUpdateMetadataField };

}]);
