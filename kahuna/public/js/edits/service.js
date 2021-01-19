import angular from 'angular';
import Rx from 'rx';

import {editsApi} from '../services/api/edits-api';
import {mediaApi} from '../services/api/media-api';
import { overwrite, prepend, append } from '../util/constants/editOptions';
import { trackAll } from '../util/batch-tracking';
import { getMetadataDiff } from './metadataDiff';

export var service = angular.module('kahuna.edits.service', [
    editsApi.name,
    mediaApi.name
]);

// TODO: For now we're sending over the image so we can compare against it to
// see when it's synced. We should have a link on the resource to be able to do
// this.
service.factory('editsService',
                ['$rootScope', '$q', 'editsApi', 'mediaApi', 'apiPoll', 'imageAccessor',
                 function($rootScope, $q, editsApi, mediaApi, apiPoll, imageAccessor) {

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
                { edit, image } : $q.reject('data not matching')
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
        return apiPoll(checkSynced);
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
            then(({ edit }) => {
                runWatcher(resource, 'update-end');
                return edit;
            }).
            catch(() => runWatcher(resource, 'update-error'));
    }


    function firstAsPromise(stream$) {
        const defer = $q.defer();
        const unsubscribe = stream$.subscribe(defer.resolve, defer.reject);
        defer.promise.finally(unsubscribe);
        return defer.promise;
    }

    // A pool a requests. Its promise will be resolved with the last
    // request added to the pool.
    function createRequestPool() {
        const requestsPromises = new Rx.Subject();
        const latestCompleted = requestsPromises.flatMapLatest(Rx.Observable.fromPromise);

        return {
            registerPromise: (promise) => requestsPromises.onNext(promise),
            promise: firstAsPromise(latestCompleted)
        };
    }

    function withWatcher(resource, promise) {
        runWatcher(resource, 'update-start');
        return promise.
            then(val => {
                runWatcher(resource, 'update-end');
                return val;
            }).
            catch(e => {
                runWatcher(resource, 'update-error');
                return $q.reject(e);
            });
    }

    // Map of Resource to request pool, storing all currently active
    // update requests for a given Resource
    const updateRequestPools = new Map();

    // inBatch determines whether the function chain should eventually emit an angular message
    // as emitting multiple times is very performance heavy
    // ideally this should be refactored out.
    function registerUpdateRequest(resource, originalImage, inBatch = false) {
        const requestPool = createRequestPool();
        const promise = withWatcher(resource, requestPool.promise).
              then(({ edit, image }) => {
                if (!inBatch) {
                  $rootScope.$emit('images-updated', [image]);
                }
                return edit;
              });

        const newRequest = {
            registerPromise: requestPool.registerPromise,
            promise
        };

        // Register request pool, free once done
        updateRequestPools.set(resource, newRequest);
        promise.finally(() => updateRequestPools.delete(resource));

        return newRequest;
    }

    // inBatch determines whether the function chain should eventually emit an angular message
    // as emitting multiple times is very performance heavy
    // ideally this should be refactored out.

    /**
     * @param resource {Resource} resource to update
     * @param data {*} PUTs `data` and replaces old data
     * @param originalImage {Resource} the image used to check if we've re-indexed yet
     * @param inBatch {Boolean} is this being called multiple times? (see comment)
     * @returns {Promise.<Resource>} completed when information is synced
     */
    function update(resource, data, originalImage, inBatch = false) {
        const newRequest = resource.put({ data }).
              then(edit => getSynced(originalImage, newImage => matches(edit, newImage)));

        const existingRequestPool = updateRequestPools.get(resource) ||
            registerUpdateRequest(resource, originalImage, inBatch);

        existingRequestPool.registerPromise(newRequest);

        return existingRequestPool.promise;
    }

    // HACK: This is a very specific action that we use the `updateRequestPool` ast this action
    // actually updates the metadata as a sideeffect.
    // ALSO: inBatch determines whether the function chain should eventually emit an angular message
    // as emitting multiple times is very performance heavy
    // ideally this should be refactored out.
    function updateMetadataFromUsageRights(originalImage, inBatch = false) {
        const resource = originalImage.data.userMetadata.data.metadata;
        const newRequest = resource.perform('set-from-usage-rights').
              then(edit => getSynced(originalImage, newImage => matches(edit, newImage)));

        const existingRequestPool = updateRequestPools.get(resource) ||
            registerUpdateRequest(resource, originalImage, inBatch);

        existingRequestPool.registerPromise(newRequest);

        return existingRequestPool.promise;
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


    // inBatch determines whether the function chain should eventually emit an angular message
    // as emitting multiple times is very performance heavy
    // ideally this should be refactored out.
    function updateMetadataField (image, field, value, inBatch = false) {
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

            return $q.when(false);
        }

        var proposedMetadata = angular.copy(metadata);
        proposedMetadata[field] = value;

        // peopleInImage is a special case. This turns a comma-separated string into an array trimmed of whitespace
        if (field === 'peopleInImage' || field === 'keywords' ) {
          proposedMetadata[field] = value.toString().split(',')
            .map(s => s.trim())
            .filter(s => s !== "");
        }

        var changed = getMetadataDiff(image, proposedMetadata);

        return update(image.data.userMetadata.data.metadata, changed, image, inBatch)
          .then(() => image.get());
    }

    function getNewFieldValue(image, field, value, editOption) {
      switch (editOption) {
        case prepend.key:
          return value + ' ' + imageAccessor.readMetadata(image)[field];
        case append.key:
          return imageAccessor.readMetadata(image)[field] + ' ' + value;
        default:
          return value;
      }
    }


    function batchUpdateMetadataField(images, field, value, editOption = overwrite.key) {
        return trackAll($q, $rootScope, field, images, image => {
            const newFieldValue = getNewFieldValue(image, field, value, editOption);
            return updateMetadataField(image, field, newFieldValue, true);
        },'images-updated');
    }

    return {
        update, add, on, canUserEdit, updateMetadataFromUsageRights,
        updateMetadataField, batchUpdateMetadataField
    };

}]);
