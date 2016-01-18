import angular from 'angular';
import Rx from 'rx';
import Immutable from 'immutable';
import {Map} from 'immutable';

export const mapFactory = angular.module('data-structure.mapFactory', []);

/**
 * Factory to create a reactive map instance.
 */
mapFactory.value('mapFactory', function() {
    const operations$ = new Rx.Subject();
    const state$ = operations$.
        scan(new Map(), (map, op) => op(map)).
        distinctUntilChanged(angular.identity, Immutable.is).
        // share across subscriptions, replay for future subscribers
        shareReplay(1);

    function queueOperation(operation) {
        operations$.onNext(operation);
    }

    // a complete replace
    function setTo(mapLike) {
        return (/*map*/) => new Map(mapLike);
    }

    function clear() {
        return (map) => map.clear();
    }

    function merge(mapLike) {
        return (map) => map.merge(mapLike);
    }

    return {
        // State
        state$,

        // Operations
        setTo(map) { queueOperation(setTo(map)); },
        merge(map) { queueOperation(merge(map)); },
        clear()    { queueOperation(clear());    }
    };
});

export default mapFactory;
