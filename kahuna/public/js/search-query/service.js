import angular from 'angular';
import Rx from 'rx';
import '../util/rx';

export const searchQueryService = angular.module('gr.searchQuery.service', ['util.rx']);

searchQueryService.factory('searchQueryService', [function() {
    const query$ = new Rx.Subject();

    // TODO: When we update rx, we need to swap the seed / acc around
    const q$ = query$.
        scan('', (state, fn) => fn(state).trim()).
        distinctUntilChanged().
        shareReplay(1);

    // TODO: It'd be nice to build this up from an API
    const hasSpace    = s     => /\s/g.test(s);
    const labelMatch  = label => new RegExp(`(label:|#)("|')?${label}(("|')|\\b)`, 'g');
    const createLabel = label => hasSpace(label) ? `#"${label}"` : `#${label}`;

    function hasLabel(q, label) {
        return labelMatch(label).test(q);
    }

    function addLabel(label) {
        query$.onNext(q => hasLabel(q, label) ? q : `${q} ${createLabel(label)}`);
    }

    function removeLabel(label) {
        query$.onNext(q => q.replace(labelMatch(label), ''));
    }

    function set(q) {
        query$.onNext(() => q || '');
    }

    return { q$, addLabel, removeLabel, 'set': set };
}]);
