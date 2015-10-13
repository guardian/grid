import angular from 'angular';
import Rx from 'rx';
import '../util/rx';

export const searchQueryService = angular.module('gr.searchQuery.service', ['util.rx']);

searchQueryService.factory('searchQueryService', [function() {
    // TODO: When we update rx, we need to swap the seed / acc around
    const q$ = (query$, startWith) => query$.
        scan(startWith || '', (state, fn) => fn(state).trim()).
        distinctUntilChanged().
        shareReplay(1);

    // TODO: It'd be nice to build this up from an API
    const hasSpace    = s     => /\s/g.test(s);
    const labelMatch  = label => new RegExp(`(label:|#)("|')?${label}(("|')|\\b)`, 'g');
    const createLabel = label => hasSpace(label) ? `#"${label}"` : `#${label}`;

    function hasLabel(q, label) {
        return labelMatch(label).test(q);
    }

    function addLabel(query$) {
        return label =>
            query$.onNext(q => hasLabel(q, label) ? q : `${q} ${createLabel(label)}`);
    }

    function removeLabel(query$) {
        return label => query$.onNext(q => q.replace(labelMatch(label), ''));
    }

    function setQuery(query$) {
        return q => query$.onNext(() => q || '');
    }

    return q => {
        const query$ = new Rx.Subject();
        const service = {
            q$:          q$(query$, q),
            addLabel:    addLabel(query$),
            removeLabel: removeLabel(query$),
            setQuery:    setQuery(query$)
        };

        return service;
    };
}]);
