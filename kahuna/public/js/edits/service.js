import angular from 'angular';

import '../services/api/edits-api';
import '../services/api/media-api';

export var service = angular.module('kahuna.edits.service', []);

// TODO: For now we're sending over the image so we can compare against it to
// see when it's synced. We should have a link on the resource to be able to do
// this.
service.factory('editsService',
                ['$q', 'editsApi', 'mediaApi', 'poll',
                 function($q, editsApi, mediaApi, poll) {

    const pollFrequency = 500; // ms
    const pollTimeout   = 20 * 1000; // ms

    /**
     *
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
     *
     * @param edit {Resource}
     * @param image {Resource}
     * @returns {Promise.<Resource>|reject} return the `edit` resource on `success`
     *
     * Searches for the `edit` in `image` and compares the two
     */
    function matches(edit, image) {
        // find that matching resource
        return findMatchingEditInImage(edit, image).then(matchingEdit =>
            matchingEdit && angular.equals(matchingEdit.data, edit.data) ?
                edit : $q.reject('data not matching')
        );
    }

    /**
     *
     * @param edit {Resource} edit to search for
     * @param collection {Resource} collection to search from
     * @param image {Resource} image to tell when the re-index has happened
     * @returns {Promise.<Resource>|reject} return the `collection.get` `Promise`
     *
     * Searches for the `edit` in `image` and compares the two
     */
    function missing(edit, collection, image) {
        return findMatchingEditInImage(collection, image).then(matchingEdit => {
            const stillPresent = matchingEdit &&
                                 matchingEdit.data.find(r => r.uri === edit.uri);

            return stillPresent ?
                $q.reject('data not matching') : collection.get();
        });
    }

    function getSynced(image, check) {
        const checkSynced = () => image.get().then(check);
        return poll(checkSynced, pollFrequency, pollTimeout);
    }

    /**
     *
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
            catch(error => runWatcher(resource, 'update-error'));
    }

    /**
     *
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
            catch(error => runWatcher(resource, 'update-error'));

    }

    //
    /**
     *
     * @param resource {Resource} resource to remove
     * @param collection {Resource} the collection you want to remove a `Resource` from
     * @param originalImage {Resource} the image used to check if we've re-indexed yet
     * @returns {Promise.<Resource>} completed when information is synced
     *
     * This is a bit of a hack function as we don't have a way of deleting from
     * a collection on the API, only per label / right. We should probably
     * choose between working with the collection e.g. labels, or working with
     * each collection item directly, whereas now, for adding, we use the
     * collection, and for deleting we use the collection item
     */
    function removeFromCollection(resource, collection, originalImage) {
        runWatcher(collection, 'update-start');

        return resource.delete().then(edit =>
            getSynced(originalImage, newImage => missing(edit, collection, newImage))).
            then(collection => {
                runWatcher(collection, 'update-end');
                return collection;
            });
    }

    // Event handling
    // TODO: Use proper names from http://en.wikipedia.org/wiki/Watcher_%28comics%29
    /**
     *
     * @type {Map.<String => Map>} a map with key as the resource URI and value
     * as a watcher Map (see `createWatcher`).
     */
    const watchers = new Map();

    /**
     *
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
     *
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

    return { update, add, removeFromCollection, on };

}]);
