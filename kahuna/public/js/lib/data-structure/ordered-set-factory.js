import angular from 'angular';
import Rx from 'rx';
import Immutable from 'immutable';
import {OrderedSet} from 'immutable';

const orderedSetFactory = angular.module('data-structure.ordered-set-factory', [
]);

/**
 * Factory to create a reactive ordered set instance.
 */
orderedSetFactory.value('orderedSetFactory', function() {
    const operations$ = new Rx.Subject();
    const items$ = operations$.
        startWith(clear()).
        scan(new OrderedSet(), (set, op) => op(set)).
        distinctUntilChanged(angular.identity, Immutable.is).
        // share across subscriptions, replay for future subscribers
        shareReplay(1);

    const count$ = items$.map(set => set.size).distinctUntilChanged();
    const isEmpty$ = count$.map(count => count === 0).distinctUntilChanged();

    function queueOperation(operation) {
        operations$.onNext(operation);
    }

    function add(item) {
        return (set) => set.add(item);
    }

    function union(items) {
        return (set) => set.union(items);
    }

    function remove(item) {
        return (set) => set.delete(item);
    }

    function toggle(item) {
        return (set) => set.has(item) ? set.delete(item) : set.add(item);
    }

    function clear() {
        return (set) => set.clear();
    }

    return {
        // State
        items$,
        count$,
        isEmpty$,

        // Operations
        add(item)    { queueOperation(add(item));    },
        union(items) { queueOperation(union(items)); },
        remove(item) { queueOperation(remove(item)); },
        toggle(item) { queueOperation(toggle(item)); },
        clear()      { queueOperation(clear());      }
    };
});

export default orderedSetFactory;
