import angular from 'angular';
import Rx from 'rx';
import Immutable from 'immutable';
import {Map} from 'immutable';

const mapFactory = angular.module('data-structure.mapFactory', [
]);

/**
 * Factory to create a reactive list instance.
 */
mapFactory.value('mapFactory', function() {
    const operations$ = new Rx.Subject();
    const map$ = operations$.
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

    return {
        // State
        map$,

        // Operations
        setTo(map) { queueOperation(setTo(map)); },
        clear()    { queueOperation(clear());    }
    };
});

export default mapFactory;
