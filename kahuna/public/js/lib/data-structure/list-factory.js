import angular from 'angular';
import Rx from 'rx';
import Immutable from 'immutable';
import {List} from 'immutable';

const listFactory = angular.module('data-structure.list-factory', [
]);

/**
 * Factory to create a reactive list instance.
 */
listFactory.value('listFactory', function() {
    const operations$ = new Rx.Subject();
    const items$ = operations$.
        startWith(clear()).
        scan(new List(), (list, op) => op(list)).
        distinctUntilChanged(angular.identity, Immutable.is).
        // share across subscriptions, replay for future subscribers
        shareReplay(1);

    const count$ = items$.map(list => list.size).distinctUntilChanged();
    const isEmpty$ = count$.map(count => count === 0).distinctUntilChanged();

    function queueOperation(operation) {
        operations$.onNext(operation);
    }

    function set(index, item) {
        return (list) => list.set(index, item);
    }

    function map(f) {
        return (list) => list.map(f);
    }

    function removeAt(index) {
        return (list) => list.delete(index);
    }

    function resize(length) {
        return (list) => list.setSize(length);
    }

    function clear() {
        return (list) => list.clear();
    }

    return {
        // State
        items$,
        count$,
        isEmpty$,

        // Operations
        set(index, item) { queueOperation(set(index, item)); },
        map(f)           { queueOperation(map(f));           },
        removeAt(index)  { queueOperation(removeAt(index));  },
        resize(length)   { queueOperation(resize(length));   },
        clear()          { queueOperation(clear());          }
    };
});

export default listFactory;
